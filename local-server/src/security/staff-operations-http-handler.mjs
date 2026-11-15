import {
  AuthenticationError, AuthenticationServiceError, CsrfValidationError
} from "./auth-service.mjs";
import { AuthorizationError, staffHasPermission } from "./authorization.mjs";
import {
  readSessionTokenFromCookieHeader, readCsrfTokenFromCookieHeader
} from "./session-cookies.mjs";

const HEADERS = Object.freeze({
  "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer", "X-Frame-Options":"DENY",
  "Cross-Origin-Resource-Policy":"same-origin",
  "Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Strict-Transport-Security":"max-age=86400"
});
const LEAVE_TYPES = new Set(["Annual","Sick","Maternity","Paternity","Compassionate","Unpaid","Study","Other"]);
class InputError extends Error { constructor(message,status=400){super(message);this.status=status;} }
function send(response,status,payload) {
  const body=Buffer.from(JSON.stringify(payload),"utf8");
  response.writeHead(status,{...HEADERS,"Content-Type":"application/json; charset=utf-8","Content-Length":body.length});
  response.end(body);
}
async function readJson(request) {
  const type=String(request.headers["content-type"]??"").split(";",1)[0].trim().toLowerCase();
  if(type!=="application/json")throw new InputError("JSON content is required.",415);
  const chunks=[];let size=0;
  for await(const chunk of request){size+=chunk.length;if(size>16*1024)throw new InputError("Request body is too large.",413);chunks.push(chunk);}
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new InputError("Request body is not valid JSON.");}
  if(!body||typeof body!=="object"||Array.isArray(body))throw new InputError("A JSON object is required.");
  return body;
}
function has(principal,permission){return staffHasPermission({principal,permissionCode:permission});}
function requireAny(principal,permissions){
  if(principal?.principalType!=="staff"||!permissions.some(permission=>has(principal,permission)))throw new AuthorizationError();
}
function validDate(value){
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [y,m,d]=value.split("-").map(Number),date=new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
}
function parseLeaveRequest(body){
  if(!LEAVE_TYPES.has(body.leaveType))throw new InputError("Choose a supported leave type.");
  if(!validDate(body.startsOn)||!validDate(body.endsOn)||body.endsOn<body.startsOn)throw new InputError("Enter valid leave dates in YYYY-MM-DD order.");
  const days=Number(body.requestedDays);
  if(!Number.isFinite(days)||days<=0||days>366||Math.round(days*100)!==days*100)throw new InputError("Requested days must be between 0.01 and 366, with up to two decimal places.");
  if(typeof body.reason!=="string"||body.reason.trim().length<8||body.reason.trim().length>1200)throw new InputError("Leave reason must contain 8 to 1,200 characters.");
  return {leaveType:body.leaveType,startsOn:body.startsOn,endsOn:body.endsOn,requestedDays:days,reason:body.reason.trim()};
}
export function createStaffOperationsHttpHandler({authService,repository,expectedOrigin,onError}={}){
  if(!authService||typeof authService.authenticate!=="function"||
    !repository||typeof repository.getWorkspace!=="function"||typeof repository.submitLeaveRequest!=="function"){
    throw new TypeError("Staff Operations API dependencies are incomplete.");
  }
  let origin;try{origin=new URL(expectedOrigin);}catch{throw new TypeError("An exact HTTPS origin is required.");}
  if(origin.protocol!=="https:"||origin.origin!==expectedOrigin||origin.pathname!=="/"||origin.search||origin.hash)throw new TypeError("An exact HTTPS origin is required.");

  return async function handleStaffOperations(request,response){
    const url=new URL(request.url??"/",origin);
    const isWorkspace=url.pathname==="/api/v1/staff/operations/workspace";
    const isLeaveSubmit=url.pathname==="/api/v1/staff/leave/requests";
    if(!isWorkspace&&!isLeaveSubmit)return false;
    const method=String(request.method??"GET").toUpperCase();
    const allowed=isWorkspace?["GET"]:["POST"];
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
      if(isLeaveSubmit){
        requireAny(principal,["staff.leave_manage"]);
        const input=parseLeaveRequest(await readJson(request));
        const leaveRequest=await repository.submitLeaveRequest({staffId:principal.id,...input});
        send(response,201,{leaveRequest});
        return true;
      }
      const permissions=[
        "staff.attendance_manage","staff.attendance_review",
        "staff.leave_manage","staff.leave_review","staff.leave_balance_manage",
        "staff.payroll_read","staff.payroll_manage"
      ];
      requireAny(principal,permissions);
      const leaveManage=has(principal,"staff.leave_manage");
      const workspace=await repository.getWorkspace({
        staffId:principal.id,
        includeAttendance:has(principal,"staff.attendance_manage")||has(principal,"staff.attendance_review"),
        includeOwnLeave:leaveManage,
        includeLeaveReview:has(principal,"staff.leave_review"),
        includeAllLeaveBalances:has(principal,"staff.leave_balance_manage"),
        includePayroll:has(principal,"staff.payroll_read")||has(principal,"staff.payroll_manage")
      });
      send(response,200,workspace);
    }catch(error){
      try{onError?.(error);}catch{}
      if(error instanceof InputError)send(response,error.status,{error:error.message});
      else if(error instanceof AuthenticationError)send(response,401,{error:"A valid staff session is required."});
      else if(error instanceof AuthorizationError)send(response,403,{error:"Your role is not authorised to access Staff Operations."});
      else if(error instanceof CsrfValidationError)send(response,403,{error:"The request could not be verified."});
      else if(error instanceof AuthenticationServiceError)send(response,503,{error:"Authentication is temporarily unavailable."});
      else if(["23514","23503","23505","42501"].includes(error?.code))send(response,409,{error:error.message||"The staff request conflicts with current school policy or records."});
      else send(response,503,{error:"The Staff Operations request could not be completed."});
    }
    return true;
  };
}
