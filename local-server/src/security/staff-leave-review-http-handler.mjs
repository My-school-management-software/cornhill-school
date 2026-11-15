import { AuthenticationError, AuthenticationServiceError, CsrfValidationError } from "./auth-service.mjs";
import { AuthorizationError, staffHasPermission } from "./authorization.mjs";
import { readSessionTokenFromCookieHeader, readCsrfTokenFromCookieHeader } from "./session-cookies.mjs";

const HEADERS = Object.freeze({
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
  "X-Frame-Options":"DENY","Cross-Origin-Resource-Policy":"same-origin",
  "Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Strict-Transport-Security":"max-age=86400"
});
const UUID="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
function send(res,status,payload){const body=Buffer.from(JSON.stringify(payload));res.writeHead(status,{...HEADERS,"Content-Type":"application/json; charset=utf-8","Content-Length":body.length});res.end(body);}
async function readBody(req){
  const type=String(req.headers["content-type"]??"").split(";",1)[0].trim().toLowerCase();
  if(type!=="application/json")throw Object.assign(new Error("JSON content is required."),{status:415});
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8192)throw Object.assign(new Error("Request body is too large."),{status:413});chunks.push(chunk);}
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw Object.assign(new Error("Invalid JSON."),{status:400});}
  if(!body||typeof body!=="object"||Array.isArray(body))throw Object.assign(new Error("A JSON object is required."),{status:400});
  if(!["Approved","Rejected"].includes(body.decision))throw Object.assign(new Error("Choose Approved or Rejected."),{status:400});
  if(typeof body.note!=="string"||body.note.trim().length>1200||(body.decision==="Rejected"&&body.note.trim().length<5))throw Object.assign(new Error("A rejection reason of at least five characters is required; notes may not exceed 1,200 characters."),{status:400});
  return {decision:body.decision,note:body.note.trim()};
}
export function createStaffLeaveReviewHttpHandler({authService,repository,expectedOrigin,onError}={}){
  if(!authService||typeof authService.authenticate!=="function"||!repository||typeof repository.reviewRequest!=="function")throw new TypeError("Leave review dependencies are incomplete.");
  let origin;try{origin=new URL(expectedOrigin);}catch{throw new TypeError("An exact HTTPS origin is required.");}
  if(origin.protocol!=="https:"||origin.origin!==expectedOrigin||origin.pathname!=="/"||origin.search||origin.hash)throw new TypeError("An exact HTTPS origin is required.");
  return async function handle(req,res){
    const url=new URL(req.url??"/",origin);
    const match=url.pathname.match(new RegExp("^/api/v1/staff/leave/requests/("+UUID+")/review$","i"));
    if(!match)return false;
    if(req.method!=="POST"){res.writeHead(405,{...HEADERS,Allow:"POST","Content-Length":0});res.end();return true;}
    if(req.socket?.encrypted!==true){send(res,426,{error:"Secure HTTPS transport is required."});return true;}
    if(req.headers.host!==origin.host||req.headers.origin!==origin.origin){send(res,421,{error:"Request origin is not authorised."});return true;}
    try{
      const principal=await authService.authenticate({sessionToken:readSessionTokenFromCookieHeader(req.headers.cookie),method:"POST",csrfToken:req.headers["x-cornhill-csrf"]??readCsrfTokenFromCookieHeader(req.headers.cookie)});
      if(principal?.principalType!=="staff"||!staffHasPermission({principal,permissionCode:"staff.leave_review"}))throw new AuthorizationError();
      const input=await readBody(req);
      const leaveRequest=await repository.reviewRequest({requestId:match[1],reviewerStaffId:principal.id,...input});
      send(res,200,{leaveRequest});
    }catch(error){
      try{onError?.(error);}catch{}
      if(error.status===400||error.status===413||error.status===415)send(res,error.status,{error:error.message});
      else if(error instanceof AuthenticationError)send(res,401,{error:"A valid staff session is required."});
      else if(error instanceof AuthorizationError||error instanceof CsrfValidationError)send(res,403,{error:"Your role is not authorised to review leave requests."});
      else if(error instanceof AuthenticationServiceError)send(res,503,{error:"Authentication is temporarily unavailable."});
      else if(error.code==="P0002")send(res,409,{error:error.message});
      else if(["23514","23503","23P01","42501"].includes(error.code))send(res,409,{error:"The leave request conflicts with current school policy or records."});
      else send(res,503,{error:"The leave review could not be completed."});
    }
    return true;
  };
}
