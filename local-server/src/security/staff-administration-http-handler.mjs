import {
  AuthenticationError, AuthenticationServiceError, CsrfValidationError
} from "./auth-service.mjs";
import { AuthorizationError, isLocalUuid, staffHasPermission } from "./authorization.mjs";
import {
  readSessionTokenFromCookieHeader, readCsrfTokenFromCookieHeader
} from "./session-cookies.mjs";

const HEADERS = Object.freeze({
  "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Strict-Transport-Security": "max-age=86400"
});
const RESERVED = new Set(["system.roles_manage", "system.backups_manage"]);
const ROLES = new Set([
  "headteacher","deputy_headteacher","director_of_studies","bursar","deputy_bursar",
  "teacher","class_teacher","upper_primary_teacher","lower_primary_teacher","nursery_head",
  "matron","patron","senior_woman","senior_man","store_manager","cook"
]);
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
  for await(const chunk of request){size+=chunk.length;if(size>64*1024)throw new InputError("Request body is too large.",413);chunks.push(chunk);}
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new InputError("Request body is not valid JSON.");}
  if(!body||typeof body!=="object"||Array.isArray(body))throw new InputError("A JSON object is required.");
  return body;
}
function requireDirectorManager(principal) {
  if(principal?.principalType!=="staff"||!Array.isArray(principal.roles)||
     !principal.roles.includes("director")||
     !staffHasPermission({principal,permissionCode:"system.roles_manage"}))throw new AuthorizationError();
}
function text(value,min,max,label,required=true) {
  if(value==null&&!required)return null;
  if(typeof value!=="string"||value.trim().length<(required?min:0)||value.trim().length>max)throw new InputError(label+" is invalid.");
  return value.trim()||null;
}
function parseRolePermissions(body) {
  if(!Array.isArray(body.permissionCodes)||body.permissionCodes.length>50)throw new InputError("A permission list is required.");
  const values=body.permissionCodes;
  if(values.some(v=>typeof v!=="string"||! /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(v))||
     new Set(values).size!==values.length||values.some(v=>RESERVED.has(v)))throw new InputError("The permission list contains duplicate, invalid or Director-reserved permissions.");
  return values;
}
function parseNewStaff(body,passwordHasher) {
  const username=text(body.username,3,64,"Username");
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(username))throw new InputError("Username may contain letters, numbers, dots, underscores and hyphens.");
  const password=body.password;
  if(typeof password!=="string"||password.length<14||password.length>128||Buffer.byteLength(password,"utf8")>1024)throw new InputError("Staff password must be 14 to 128 characters.");
  const roleCode=body.roleCode;
  if(typeof roleCode!=="string"||!ROLES.has(roleCode))throw new InputError("Choose a valid staff role. A second Director cannot be created here.");
  const email=text(body.email,0,254,"Email",false);
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new InputError("Email address is invalid.");
  const phoneE164=text(body.phoneE164,0,13,"Phone",false);
  if(phoneE164&&!/^\+256[0-9]{9}$/.test(phoneE164))throw new InputError("Staff phone must use the Uganda +256 format.");
  const hiredOn=body.hiredOn;
  const parsedHireDate=typeof hiredOn==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(hiredOn)
    ? new Date(hiredOn+"T00:00:00Z") : null;
  if(!parsedHireDate||!Number.isFinite(parsedHireDate.getTime())||
     parsedHireDate.toISOString().slice(0,10)!==hiredOn)throw new InputError("Hire date must be a real date in YYYY-MM-DD format.");
  const jobTitle=text(body.jobTitle,2,100,"Job title");
  const staffNumber=text(body.staffNumber,2,30,"Staff number");
  if(!/^[A-Z0-9_-]{2,30}$/.test(staffNumber))throw new InputError("Staff number must use capital letters, numbers, underscores or hyphens.");
  return {
    username,email,password,roleCode,phoneE164,hiredOn,jobTitle,staffNumber,
    legalName:text(body.legalName,2,160,"Legal name"),
    preferredName:text(body.preferredName,0,160,"Preferred name",false),
    department:text(body.department,0,100,"Department",false)
  };
}
export function createStaffAdministrationHttpHandler({authService,repository,passwordHasher,expectedOrigin,onError}={}) {
  if(!authService||typeof authService.authenticate!=="function"||
     !repository||typeof repository.getAdministrationWorkspace!=="function"||
     typeof repository.setRolePermissions!=="function"||
     typeof repository.createStaffAccount!=="function"||
     !passwordHasher||typeof passwordHasher.hash!=="function"||
     typeof passwordHasher.isArgon2idHash!=="function")throw new TypeError("Staff administration dependencies are incomplete.");
  let origin;try{origin=new URL(expectedOrigin);}catch{throw new TypeError("An exact HTTPS origin is required.");}
  if(origin.protocol!=="https:"||origin.origin!==expectedOrigin||origin.pathname!=="/"||origin.search||origin.hash)throw new TypeError("An exact HTTPS origin is required.");
  return async function handleStaffAdministration(request,response) {
    const url=new URL(request.url??"/",origin);
    const isWorkspace=url.pathname==="/api/v1/security/role-management";
    const permissionMatch=url.pathname.match(/^\/api\/v1\/security\/roles\/([a-z][a-z0-9_]{1,49})\/permissions$/);
    const isCreate=url.pathname==="/api/v1/security/staff-accounts";
    if(!isWorkspace&&!permissionMatch&&!isCreate)return false;
    const method=String(request.method??"GET").toUpperCase();
    const allowed=isWorkspace?["GET"]:["POST"];
    if(!allowed.includes(method)){response.writeHead(405,{...HEADERS,Allow:allowed.join(", "),"Content-Length":0});response.end();return true;}
    if(request.socket?.encrypted!==true){send(response,426,{error:"Secure HTTPS transport is required."});return true;}
    if(request.headers.host!==origin.host||(method!=="GET"&&request.headers.origin!==origin.origin)){send(response,421,{error:"Request origin is not authorised."});return true;}
    try {
      const csrfToken=method==="GET"?undefined:request.headers["x-cornhill-csrf"]??readCsrfTokenFromCookieHeader(request.headers.cookie);
      const principal=await authService.authenticate({sessionToken:readSessionTokenFromCookieHeader(request.headers.cookie),method,csrfToken});
      requireDirectorManager(principal);
      if(isWorkspace){send(response,200,await repository.getAdministrationWorkspace());return true;}
      if(permissionMatch){
        if(permissionMatch[1]==="director")throw new InputError("The Director role is protected and cannot be edited.",403);
        const permissionCodes=parseRolePermissions(await readJson(request));
        const result=await repository.setRolePermissions({actorStaffId:principal.id,roleCode:permissionMatch[1],permissionCodes});
        send(response,200,{result});return true;
      }
      const input=parseNewStaff(await readJson(request),passwordHasher);
      const passwordHash=await passwordHasher.hash(input.password);
      if(!passwordHasher.isArgon2idHash(passwordHash))throw new Error("Password hashing policy validation failed.");
      const {password,...safeInput}=input;
      const staff=await repository.createStaffAccount({actorStaffId:principal.id,...safeInput,passwordHash});
      send(response,201,{staff});
    } catch(error) {
      try{onError?.(error);}catch{}
      if(error instanceof InputError)send(response,error.status,{error:error.message});
      else if(error instanceof AuthenticationError)send(response,401,{error:"A valid staff session is required."});
      else if(error instanceof AuthorizationError)send(response,403,{error:"Only the authorised Director can manage staff accounts and role permissions."});
      else if(error instanceof CsrfValidationError)send(response,403,{error:"The request could not be verified."});
      else if(error instanceof AuthenticationServiceError)send(response,503,{error:"Authentication is temporarily unavailable."});
      else if(["23505","23514","23503","42501","P0001"].includes(error?.code))send(response,409,{error:error.message||"The staff change conflicts with current school records."});
      else send(response,503,{error:"The staff administration request could not be completed."});
    }
    return true;
  };
}
