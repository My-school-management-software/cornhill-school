import {
  AuthenticationError, AuthenticationServiceError, CsrfValidationError
} from "./auth-service.mjs";
import { AuthorizationError, isLocalUuid, staffHasClassAssignment, staffHasPermission } from "./authorization.mjs";
import { readSessionTokenFromCookieHeader, readCsrfTokenFromCookieHeader } from "./session-cookies.mjs";
import {validateNurseryMaterialCollection} from "./nursery-materials-contract.mjs";

const HEADERS = Object.freeze({
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer","X-Frame-Options":"DENY",
  "Cross-Origin-Resource-Policy":"same-origin",
  "Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Strict-Transport-Security":"max-age=86400"
});
class InputError extends Error {
  constructor(message, status=400) { super(message); this.status=status; }
}
function send(response,status,payload,method="GET") {
  const body=Buffer.from(JSON.stringify(payload),"utf8");
  response.writeHead(status,{...HEADERS,"Content-Type":"application/json; charset=utf-8","Content-Length":body.length});
  response.end(method==="HEAD"?undefined:body);
}
async function readJson(request) {
  if (String(request.headers["content-type"]??"").split(";",1)[0].trim().toLowerCase()!=="application/json")
    throw new InputError("A JSON object is required.",415);
  const chunks=[]; let size=0;
  for await (const part of request) {
    size+=part.length;
    if (size>8192) throw new InputError("Materials receipt request exceeds the size limit.",413);
    chunks.push(part);
  }
  let body;
  try {body=JSON.parse(Buffer.concat(chunks).toString("utf8"));} catch {throw new InputError("Materials receipt JSON is invalid.");}
  if(!body||typeof body!=="object"||Array.isArray(body))throw new InputError("A JSON object is required.");
  return body;
}

const CLASS_SCOPED_ROLES = new Set([
  "teacher","class_teacher","lower_primary_teacher","upper_primary_teacher","nursery_head"
]);
export function createNurseryMaterialsHttpHandler({authService,repository,expectedOrigin}={}) {
  if(typeof authService?.authenticate!=="function" ||
     typeof repository?.getLearnerScope!=="function" ||
     typeof repository?.listCollections!=="function" ||
     typeof repository?.summarizeAllCollections!=="function" ||
     typeof repository?.recordCollection!=="function") {
    throw new TypeError("Nursery materials API dependencies are incomplete.");
  }
  let origin; try {origin=new URL(expectedOrigin);} catch {throw new TypeError("An exact HTTPS origin is required.");}
  if(origin.protocol!=="https:"||origin.origin!==expectedOrigin||
     origin.pathname!=="/"||origin.search||origin.hash)throw new TypeError("An exact HTTPS origin is required.");

  return async function handleNurseryMaterials(request,response) {
    const url=new URL(request.url??"/",origin);
    const match=url.pathname.match(/^\/api\/v1\/school\/learners\/([^/]+)\/nursery-materials$/);
    if(!match)return false;
    const method=String(request.method??"GET").toUpperCase();
    if(!["GET","HEAD","POST"].includes(method)) {
      response.writeHead(405,{...HEADERS,Allow:"GET, HEAD, POST","Content-Length":0});
      response.end();return true;
    }
    if(request.socket?.encrypted!==true) {
      send(response,426,{error:"Secure HTTPS transport is required."},method);return true;
    }
    if(request.headers.host!==origin.host || (method==="POST"&&request.headers.origin!==origin.origin)) {
      send(response,421,{error:"Request origin is not authorised."},method);return true;
    }
    try {
      const principal=await authService.authenticate({
        sessionToken:readSessionTokenFromCookieHeader(request.headers.cookie),
        method,csrfToken:method==="POST" ?
          request.headers["x-cornhill-csrf"]??readCsrfTokenFromCookieHeader(request.headers.cookie):undefined
      });
      const permission=method==="POST"?"learners.manage":"learners.read";
      if(principal?.principalType!=="staff" ||
         !staffHasPermission({principal,permissionCode:permission}))throw new AuthorizationError();
      const learnerId=match[1];
      if(!isLocalUuid(learnerId))throw new InputError("Learner identifier is invalid.");
      const scope=await repository.getLearnerScope(learnerId);
      if(!scope) {
        send(response,404,{error:"Nursery learner not found."},method);return true;
      }
      if(principal.roles.some(role=>CLASS_SCOPED_ROLES.has(role)) &&
         !staffHasClassAssignment({principal,classId:scope.classId}))throw new AuthorizationError();
      if (method==="HEAD") {
        // HEAD confirms authorized route availability, without reading private history.
        send(response,200,{receipts:[],summary:null},method);return true;
      }
      if (method==="GET") {
        const rows=await repository.listCollections(learnerId);
        const tally=await repository.summarizeAllCollections(learnerId);
        send(response,200,{receipts:rows,summary:tally,
          historyLimited:rows.length<tally.collectionEvents},method);return true;
      }
      if(scope.status!=="Active")throw new InputError("Materials can only be received for an active Nursery learner.",409);
      const body=await readJson(request);
      if(Object.hasOwn(body,"learnerId"))throw new InputError("Learner identifier must come from the selected learner.");
      let collection;
      try {collection=validateNurseryMaterialCollection({...body,learnerId});}
      catch {throw new InputError("Materials details are incomplete or invalid.");}
      const outcome=await repository.recordCollection({actorStaffId:principal.id,collection});
      send(response,outcome.created?201:200,{receipt:outcome.receipt,alreadyRecorded:!outcome.created},"POST");
    } catch(error) {
      if(error instanceof InputError)send(response,error.status,{error:error.message},method);
      else if(error instanceof AuthenticationError)send(response,401,{error:"A valid staff session is required."},method);
      else if(error instanceof AuthorizationError)send(response,403,{error:"You are not authorised to access this learner's Nursery materials."},method);
      else if(error instanceof CsrfValidationError)send(response,403,{error:"The request could not be verified."},method);
      else if(error instanceof AuthenticationServiceError)send(response,503,{error:"Authentication service temporarily unavailable."},method);
      else if(error?.code==="COLLECTION_CONFLICT"||["23505","23514","23503"].includes(error?.code))
        send(response,409,{error:"This receipt conflicts with an existing collection or learner record."},method);
      else send(response,503,{error:"Nursery materials service temporarily unavailable."},method);
    }
    return true;
  };
}
