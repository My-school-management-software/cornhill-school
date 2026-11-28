import {AuthenticationError, AuthenticationServiceError, CsrfValidationError} from "./auth-service.mjs";
import {AuthorizationError,isLocalUuid,staffHasClassAssignment,staffHasPermission} from "./authorization.mjs";
import {readSessionTokenFromCookieHeader,readCsrfTokenFromCookieHeader} from "./session-cookies.mjs";
import {validateMovementInput} from "./nursery-material-movement-contract.mjs";

const HEADERS=Object.freeze({
 "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"no-referrer","X-Frame-Options":"DENY",
 "Cross-Origin-Resource-Policy":"same-origin",
 "Content-Security-Policy":"default-src 'none';frame-ancestors 'none';base-uri 'none'",
 "Strict-Transport-Security":"max-age=86400"
});
class InputError extends Error{constructor(message,status=400){super(message);this.status=status;}}
function send(res,status,obj,method="GET"){
 const data=Buffer.from(JSON.stringify(obj),"utf8");
 res.writeHead(status,{...HEADERS,"Content-Type":"application/json; charset=utf-8",
 "Content-Length":data.length});
 res.end(method==="HEAD"?undefined:data);
}
async function jsonBody(request){
 if(String(request.headers["content-type"]??"").split(";",1)[0].trim().toLowerCase()!=="application/json")
   throw new InputError("JSON request required.",415);
 const body=[];let size=0;
 for await(const part of request){
  size+=part.length;if(size>8192)throw new InputError("Request too large.",413);
  body.push(part);
 }
 let value;
 try{value=JSON.parse(Buffer.concat(body).toString("utf8"));}
 catch{throw new InputError("Malformed request JSON.");}
 if(!value||typeof value!=="object"||Array.isArray(value))
   throw new InputError("One collection movement object required.");
 return value;
}
const SCOPE_ROLES=new Set(["teacher","class_teacher","lower_primary_teacher","upper_primary_teacher","nursery_head"]);
function isDirector(p){return p.roles.includes("director") &&
  staffHasPermission({principal:p,permissionCode:"system.roles_manage"});}
export function createNurseryMaterialMovementsHttpHandler({authService,repository,learnerRepository,expectedOrigin}={}){
 if(typeof authService?.authenticate!=="function"||
    typeof repository?.recordMovement!=="function"||
    typeof repository?.listMovements!=="function"||
    typeof repository?.summary!=="function"||
    typeof repository?.recordsCentre!=="function"||
    typeof repository?.listTeachers!=="function"||
    typeof learnerRepository?.getLearnerScope!=="function")throw new TypeError("Nursery custody API is incomplete.");
 let origin;
 try{origin=new URL(expectedOrigin);}catch{throw new TypeError("Exact HTTPS origin required.");}
 if(origin.protocol!=="https:"||origin.origin!==expectedOrigin||
    origin.pathname!=="/"||origin.search||origin.hash)
    throw new TypeError("Exact HTTPS origin required.");
 return async function handle(request,response){
  const url=new URL(request.url??"/",origin);
  const match=url.pathname.match(/^\/api\/v1\/school\/learners\/([^/]+)\/nursery-material-movements$/);
  const isRecords=url.pathname==="/api/v1/school/nursery-material-records-center";
  const isTeachers=url.pathname==="/api/v1/school/nursery-material-teachers";
  if(!match&&!isRecords&&!isTeachers)return false;
  const method=String(request.method??"GET").toUpperCase();
  if(!["GET","HEAD","POST"].includes(method)||((isRecords||isTeachers)&&method==="POST")){
   response.writeHead(405,{...HEADERS,Allow:isRecords||isTeachers?"GET, HEAD":"GET, HEAD, POST",
    "Content-Length":0});response.end();return true;
  }
  if(request.socket?.encrypted!==true){send(response,426,{error:"HTTPS required."},method);return true;}
  if(request.headers.host!==origin.host||(method==="POST"&&request.headers.origin!==origin.origin)){
   send(response,421,{error:"Request origin is not authorized."},method);return true;
  }
  try{
   const principal=await authService.authenticate({
     sessionToken:readSessionTokenFromCookieHeader(request.headers.cookie),method,
     csrfToken:method==="POST"?
       request.headers["x-cornhill-csrf"]??readCsrfTokenFromCookieHeader(request.headers.cookie):undefined
   });
   if(principal?.principalType!=="staff")throw new AuthorizationError();
   if(isRecords){
     if(!isDirector(principal))throw new AuthorizationError();
     const data=method==="HEAD"?{rows:[],limited:false}:await repository.recordsCentre();
     send(response,200,data,method);return true;
   }
   if(isTeachers){
     if(!staffHasPermission({principal,permissionCode:"learners.manage"}))throw new AuthorizationError();
     const staff=method==="HEAD"?[]:await repository.listTeachers();
     send(response,200,{teachers:staff},method);return true;
   }
   const permission=method==="POST"?"learners.manage":"learners.read";
   if(!staffHasPermission({principal,permissionCode:permission}))throw new AuthorizationError();
   const learnerId=match[1];
   if(!isLocalUuid(learnerId))throw new InputError("Learner identifier invalid.");
   const scope=await learnerRepository.getLearnerScope(learnerId);
   if(!scope){send(response,404,{error:"Nursery learner not found."},method);return true;}
   if(principal.roles.some(role=>SCOPE_ROLES.has(role))&&
      !staffHasClassAssignment({principal,classId:scope.classId}))throw new AuthorizationError();
   if(method==="HEAD"){send(response,200,{movements:[],stock:[]},method);return true;}
   if(method==="GET"){
     const movements=await repository.listMovements(learnerId);
     const stock=await repository.summary(learnerId);
     send(response,200,{movements,stock,movementHistoryLimited:movements.length===1000},method);
     return true;
   }
   if(scope.status!=="Active")throw new InputError("Only active Nursery learners can receive material handovers.",409);
   const body=await jsonBody(request);
   let movement;
   try{movement=validateMovementInput(body,{learnerId});}
   catch{throw new InputError("Material movement details are invalid.");}
   if(movement.movementType==="director_surplus"&&!isDirector(principal))
     throw new AuthorizationError();
   // Do not accept future or silently over-backdated custody movements.
   const dayparts=new Intl.DateTimeFormat("en-GB",{
     timeZone:"Africa/Kampala",year:"numeric",month:"2-digit",day:"2-digit"
   }).formatToParts(new Date());
   const piece=name=>dayparts.find(x=>x.type===name)?.value;
   const today=piece("year")+"-"+piece("month")+"-"+piece("day");
   if(movement.movementDate>today)throw new InputError("Movement date cannot be in the future.");
   const out=await repository.recordMovement({actorStaffId:principal.id,movement});
   send(response,out.created?201:200,{movement:out.movement,alreadyRecorded:!out.created},"POST");
  }catch(e){
   if(e instanceof InputError)send(response,e.status,{error:e.message},method);
   else if(e instanceof AuthenticationError)send(response,401,{error:"Valid staff session required."},method);
   else if(e instanceof AuthorizationError)send(response,403,{error:"Not authorised for Nursery material movements."},method);
   else if(e instanceof CsrfValidationError)send(response,403,{error:"Request could not be verified."},method);
   else if(e instanceof AuthenticationServiceError)send(response,503,{error:"Authentication unavailable."},method);
   else if(e?.code==="MATERIAL_STOCK_CONFLICT"||["23505","23514","23503"].includes(e?.code))
     send(response,409,{error:"Insufficient material stock, invalid recipient or duplicate request. Review the learner ledger."},method);
   else send(response,503,{error:"Material custody service unavailable."},method);
  }
  return true;
 };
}
