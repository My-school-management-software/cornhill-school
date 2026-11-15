import {
  AuthenticationError, AuthenticationServiceError, CsrfValidationError
} from "./auth-service.mjs";
import { AuthorizationError, isLocalUuid, staffHasPermission } from "./authorization.mjs";
import {
  readSessionTokenFromCookieHeader, readCsrfTokenFromCookieHeader
} from "./session-cookies.mjs";
import { AttendanceCsvError } from "./attendance-csv.mjs";

const HEADERS = Object.freeze({
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer","X-Frame-Options":"DENY",
  "Cross-Origin-Resource-Policy":"same-origin",
  "Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Strict-Transport-Security":"max-age=86400"
});
const CONNECTION_TYPES=new Set(["USB","LAN","Manual Import"]);
const DEVICE_STATUSES=new Set(["Planned","Active","Maintenance","Retired"]);
class InputError extends Error {constructor(message,status=400){super(message);this.status=status;}}
function send(response,status,payload){
  const body=Buffer.from(JSON.stringify(payload),"utf8");
  response.writeHead(status,{...HEADERS,"Content-Type":"application/json; charset=utf-8","Content-Length":body.length});
  response.end(body);
}
async function readJson(request){
  const type=String(request.headers["content-type"]??"").split(";",1)[0].trim().toLowerCase();
  if(type!=="application/json")throw new InputError("JSON content is required.",415);
  const chunks=[];let size=0;
  for await(const chunk of request){size+=chunk.length;if(size>3*1024*1024)throw new InputError("Request body exceeds the 3 MB limit.",413);chunks.push(chunk);}
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new InputError("Request body is not valid JSON.");}
  if(!body||typeof body!=="object"||Array.isArray(body))throw new InputError("A JSON object is required.");
  return body;
}
function text(value,min,max,label,optional=false){
  if(optional&& (value==null||value===""))return null;
  if(typeof value!=="string"||value.trim().length<min||value.trim().length>max)throw new InputError(label+" is invalid.");
  return value.trim();
}
function validDate(value,label){
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new InputError(label+" must use YYYY-MM-DD.");
  const [year,month,day]=value.split("-").map(Number),date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)throw new InputError(label+" is not a valid calendar date.");
  return value;
}
function deviceInput(body){
  const deviceCode=text(body.deviceCode,2,32,"Device code");
  if(!/^[A-Z0-9_-]+$/.test(deviceCode))throw new InputError("Device code must use uppercase letters, numbers, underscore or hyphen.");
  const connectionType=body.connectionType;
  if(!CONNECTION_TYPES.has(connectionType))throw new InputError("Choose USB, LAN or Manual Import as the connection type.");
  return {
    deviceCode,deviceName:text(body.deviceName,2,100,"Device name"),
    manufacturer:text(body.manufacturer,1,100,"Manufacturer",true),
    model:text(body.model,1,100,"Model",true),
    serialNumber:text(body.serialNumber,1,100,"Serial number",true),
    connectionType,deviceLocation:text(body.deviceLocation,1,160,"Device location",true)
  };
}
function uuidPath(value,label){if(!isLocalUuid(value))throw new InputError(label+" is invalid.");return value;}
function safeSourceName(value){
  const name=text(value,5,160,"CSV filename");
  if(!/\.csv$/i.test(name)||/[\\/<>:"|?*\u0000-\u001f]/.test(name)||name.includes("..")) {
    throw new InputError("Choose a plain CSV filename without path separators or special path characters.");
  }
  return name;
}
function importInput(body,deviceId,importedByStaffId){
  const csvText=text(body.csvText,1,2*1024*1024,"CSV content");
  const columns=body.columns;
  if(!columns||typeof columns!=="object"||Array.isArray(columns))throw new InputError("Choose the CSV column mapping.");
  for(const key of ["staffIdentifier","occurredAt"])text(columns[key],1,100,key+" column");
  for(const key of ["eventType","externalEventId"])if(columns[key]!=null&&columns[key]!=="")text(columns[key],1,100,key+" column");
  return {
    deviceId,sourceName:safeSourceName(body.sourceName),csvText,columns,
    importedByStaffId
  };
}
function requireImport(principal){
  if(principal?.principalType!=="staff"||!staffHasPermission({principal,permissionCode:"staff.attendance_import"}))throw new AuthorizationError();
}
export function createAttendanceImportHttpHandler({authService,repository,expectedOrigin}={}){
  const requiredMethods=["listDevices","listStaffOptions","listMappings","createDevice","setDeviceStatus","createMapping","closeMapping","listImports","listRejections","importCsv"];
  if(!authService||typeof authService.authenticate!=="function"||!repository||
      requiredMethods.some(method=>typeof repository[method]!=="function")) {
    throw new TypeError("Attendance import API dependencies are incomplete.");
  }
  let origin;try{origin=new URL(expectedOrigin);}catch{throw new TypeError("An exact HTTPS origin is required.");}
  if(origin.protocol!=="https:"||origin.origin!==expectedOrigin||origin.pathname!=="/"||origin.search||origin.hash)throw new TypeError("An exact HTTPS origin is required.");

  return async function handleAttendanceImport(request,response){
    const url=new URL(request.url??"/",origin);
    const path=url.pathname;
    const deviceMappings=path.match(/^\/api\/v1\/staff\/attendance\/devices\/([0-9a-f-]{36})\/mappings$/i);
    const deviceStatus=path.match(/^\/api\/v1\/staff\/attendance\/devices\/([0-9a-f-]{36})\/status$/i);
    const deviceImports=path.match(/^\/api\/v1\/staff\/attendance\/devices\/([0-9a-f-]{36})\/imports$/i);
    const closeMapping=path.match(/^\/api\/v1\/staff\/attendance\/mappings\/([0-9a-f-]{36})\/close$/i);
    const rejectionList=path.match(/^\/api\/v1\/staff\/attendance\/imports\/([0-9a-f-]{36})\/rejections$/i);
    const isDevices=path==="/api/v1/staff/attendance/devices";
    const isStaff=path==="/api/v1/staff/attendance/staff-options";
    const isImports=path==="/api/v1/staff/attendance/imports";
    if(!isDevices&&!isStaff&&!isImports&&!deviceMappings&&!deviceStatus&&!deviceImports&&!closeMapping&&!rejectionList)return false;

    const method=String(request.method??"GET").toUpperCase();
    const allowed=(isDevices||isStaff||isImports||deviceMappings||rejectionList)?["GET",...(isDevices?["POST"]:[])]:
      (deviceStatus||deviceImports||closeMapping)?["POST"]:[];
    if(!allowed.includes(method)){response.writeHead(405,{...HEADERS,Allow:allowed.join(", "),"Content-Length":0});response.end();return true;}
    if(request.socket?.encrypted!==true){send(response,426,{error:"Secure HTTPS transport is required."});return true;}
    if(request.headers.host!==origin.host||(method!=="GET"&&request.headers.origin!==origin.origin)){
      send(response,421,{error:"Request origin is not authorised."});return true;
    }
    try{
      const principal=await authService.authenticate({
        sessionToken:readSessionTokenFromCookieHeader(request.headers.cookie),
        method,
        csrfToken:method==="GET"?undefined:(request.headers["x-cornhill-csrf"]??readCsrfTokenFromCookieHeader(request.headers.cookie))
      });
      requireImport(principal);
      if(isDevices&&method==="GET"){send(response,200,{devices:await repository.listDevices()});return true;}
      if(isDevices&&method==="POST"){send(response,201,{device:await repository.createDevice(deviceInput(await readJson(request)))});return true;}
      if(isStaff){send(response,200,{staff:await repository.listStaffOptions()});return true;}
      if(isImports){send(response,200,{imports:await repository.listImports()});return true;}
      if(deviceMappings&&method==="GET"){
        const deviceId=uuidPath(deviceMappings[1],"Device ID");
        send(response,200,{mappings:await repository.listMappings({deviceId})});return true;
      }
      if(deviceStatus){
        const deviceId=uuidPath(deviceStatus[1],"Device ID"),body=await readJson(request);
        if(!DEVICE_STATUSES.has(body.status))throw new InputError("Choose a supported attendance device status.");
        send(response,200,{device:await repository.setDeviceStatus({deviceId,status:body.status})});return true;
      }
      if(deviceMappings&&method==="POST"){
        const deviceId=uuidPath(deviceMappings[1],"Device ID"),body=await readJson(request);
        send(response,201,{mapping:await repository.createMapping({
          deviceId,staffId:uuidPath(body.staffId,"Staff account"),deviceStaffIdentifier:text(body.deviceStaffIdentifier,1,80,"Device staff identifier"),
          effectiveFrom:validDate(body.effectiveFrom,"Mapping effective date"),createdByStaffId:principal.id
        })});return true;
      }
      if(closeMapping){
        const body=await readJson(request);
        send(response,200,{mapping:await repository.closeMapping({
          mappingId:uuidPath(closeMapping[1],"Mapping ID"),effectiveTo:validDate(body.effectiveTo,"Mapping end date")
        })});return true;
      }
      if(deviceImports){
        const deviceId=uuidPath(deviceImports[1],"Device ID");
        const input=importInput(await readJson(request),deviceId,principal.id);
        send(response,201,await repository.importCsv(input));return true;
      }
      if(rejectionList){
        const batchId=uuidPath(rejectionList[1],"Import batch ID");
        send(response,200,{rejections:await repository.listRejections({batchId})});return true;
      }
    }catch(error){
      if(error instanceof InputError||error instanceof AttendanceCsvError)send(response,error.status||400,{error:error.message});
      else if(error instanceof AuthenticationError)send(response,401,{error:"A valid staff session is required."});
      else if(error instanceof AuthorizationError)send(response,403,{error:"Your role is not authorised to manage attendance devices or imports."});
      else if(error instanceof CsrfValidationError)send(response,403,{error:"The request could not be verified."});
      else if(error instanceof AuthenticationServiceError)send(response,503,{error:"Authentication is temporarily unavailable."});
      else if(error?.code==="P0002")send(response,404,{error:error.message});
      else if(error?.code==="DEVICE_NOT_ACTIVE")send(response,409,{error:error.message});
      else if(error?.code==="ATTENDANCE_IMPORT_DUPLICATE"||error?.code==="23505"||error?.code==="23514"||error?.code==="23P01")send(response,409,{error:error.message||"The attendance record conflicts with existing device data."});
      else send(response,503,{error:"The attendance device request could not be completed."});
    }
    return true;
  };
}
