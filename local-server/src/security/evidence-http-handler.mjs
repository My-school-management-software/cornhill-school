import { randomUUID } from "node:crypto";
import {
  AuthenticationError, AuthenticationRateLimitError, AuthenticationServiceError, CsrfValidationError
} from "./auth-service.mjs";
import { staffHasPermission } from "./authorization.mjs";
import { readSessionTokenFromCookieHeader } from "./session-cookies.mjs";
import { EvidenceStoreError, MAX_EVIDENCE_BYTES } from "./private-evidence-store.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PURPOSES=new Set(["Bank deposit slip","Expense receipt","Withdrawal evidence","Other"]);
const CONTEXTS=new Set(["expense_request","bank_transaction","other"]);
const TYPES=new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
const HEADERS={
 "Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
 "X-Frame-Options":"DENY","Cross-Origin-Resource-Policy":"same-origin",
 "Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
 "Strict-Transport-Security":"max-age=86400"
};
class InputError extends Error { constructor(status,message){super(message);this.status=status;} }
function json(res,status,payload){
 const body=Buffer.from(JSON.stringify(payload));
 res.writeHead(status,{...HEADERS,"Content-Type":"application/json; charset=utf-8","Content-Length":body.length});
 res.end(body);
}
async function readJson(req){
 if(String(req.headers["content-type"]??"").split(";",1)[0].trim().toLowerCase()!=="application/json")
  throw new InputError(415,"JSON content is required.");
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>16*1024)throw new InputError(413,"Request body is too large.");chunks.push(chunk);}
 if(!size)throw new InputError(400,"A JSON request body is required.");
 let body;try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new InputError(400,"Request body is invalid.");}
 if(!body||typeof body!=="object"||Array.isArray(body))throw new InputError(400,"Request body must be an object.");
 return body;
}
async function readFile(req){
 const type=String(req.headers["content-type"]??"").split(";",1)[0].trim().toLowerCase();
 if(!TYPES.has(type))throw new InputError(415,"Use a JPEG, PNG, WebP or PDF evidence file.");
 const name=req.headers["x-evidence-filename"];
 if(typeof name!=="string"||!name.trim()||name.length>200)throw new InputError(400,"A valid evidence filename header is required.");
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>MAX_EVIDENCE_BYTES)throw new InputError(413,"Evidence exceeds the 15 MB file limit.");chunks.push(chunk);}
 if(!size)throw new InputError(400,"The evidence file is empty.");
 return {bytes:Buffer.concat(chunks),contentType:type,originalFileName:name};
}
function mapError(error){
 if(error instanceof InputError)return {status:error.status,message:error.message};
 if(error instanceof EvidenceStoreError)return {status:error.code==="EVIDENCE_TOO_LARGE"?413:400,message:error.message};
 if(error instanceof AuthenticationRateLimitError)return {status:429,message:error.message};
 if(error instanceof AuthenticationError)return {status:401,message:"A valid staff session is required."};
 if(error instanceof CsrfValidationError)return {status:403,message:error.message};
 if(error instanceof AuthenticationServiceError)return {status:503,message:error.message};
 if(error?.code==="42501")return {status:403,message:"You do not have permission for this evidence operation."};
 if(error?.code==="P0002")return {status:404,message:"The evidence request or file was not found."};
 if(error?.code==="22023")return {status:400,message:"The evidence request contains invalid information."};
 if(error?.code==="23514")return {status:409,message:"The evidence request is not in a state that allows this operation."};
 if(error?.code==="23505")return {status:409,message:"This evidence file or request has already been recorded."};
 return {status:503,message:"The evidence service is temporarily unavailable."};
}
function safeDownloadName(name){
 return String(name??"evidence").replace(/[\r\n"\\/]/g,"_").slice(0,160)||"evidence";
}
export function createEvidenceHttpHandler({authService,evidenceRepository,evidenceStore,expectedOrigin}={}){
 if(!authService||typeof authService.authenticate!=="function")throw new TypeError("A local authentication service is required.");
 let origin;try{origin=new URL(expectedOrigin);}catch{throw new TypeError("Evidence API origin must be a valid HTTPS origin.");}
 if(origin.protocol!=="https:"||origin.origin!==expectedOrigin||origin.pathname!=="/"||origin.username||origin.password||origin.search||origin.hash)
  throw new TypeError("Evidence API origin must be an exact HTTPS origin.");
 for(const method of ["createEvidenceRequest","registerEvidenceFile","submitEvidenceRequest","reviewEvidenceRequest","getEvidenceRequest","listRecordEvidenceRequests","findEvidenceFile"])
  if(!evidenceRepository||typeof evidenceRepository[method]!=="function")throw new TypeError("A complete evidence repository is required.");
 for(const method of ["put","get","remove"])if(!evidenceStore||typeof evidenceStore[method]!=="function")throw new TypeError("A private evidence store is required.");

 return async function handleEvidenceRequest(req,res){
  let url;try{url=new URL(req.url??"/",origin);}catch{return false;}
  const path=url.pathname,base="/api/v1/finance/evidence";
  if(path!==base&&!path.startsWith(base+"/"))return false;
  const method=String(req.method??"GET").toUpperCase();
  if(req.socket?.encrypted!==true){json(res,426,{error:"Secure HTTPS transport is required."});return true;}
  if(req.headers.host!==origin.host){json(res,421,{error:"Request host is not authorised."});return true;}
  if(!["GET","POST"].includes(method)){res.writeHead(405,{...HEADERS,Allow:"GET, POST","Content-Length":0});res.end();return true;}
  try{
   if(method==="POST"&&req.headers.origin!==origin.origin){json(res,403,{error:"The request origin is not authorised."});return true;}
   const principal=await authService.authenticate({
    sessionToken:readSessionTokenFromCookieHeader(req.headers.cookie),method,
    csrfToken:typeof req.headers["x-cornhill-csrf"]==="string"?req.headers["x-cornhill-csrf"]:undefined
   });
   if(principal.principalType!=="staff"){json(res,403,{error:"Staff access is required."});return true;}
   const create=path===base+"/requests"&&method==="POST";
   const listMatch=path===base+"/requests"&&method==="GET";
   const fileMatch=path.match(new RegExp("^"+base+"/requests/([0-9a-f-]{36})/files$","i"));
   const submitMatch=path.match(new RegExp("^"+base+"/requests/([0-9a-f-]{36})/submit$","i"));
   const reviewMatch=path.match(new RegExp("^"+base+"/requests/([0-9a-f-]{36})/review$","i"));
   const requestMatch=path.match(new RegExp("^"+base+"/requests/([0-9a-f-]{36})$","i"));
   const downloadMatch=path.match(new RegExp("^"+base+"/files/([0-9a-f-]{36})/download$","i"));
   const isDownload=Boolean(downloadMatch&&method==="GET");
   const isRead=Boolean(requestMatch&&method==="GET");
   const isList=Boolean(listMatch);
   const permission=(reviewMatch&&method==="POST")?"finance.evidence_review":"finance.evidence_manage";
   if(isList){
    const contextType=url.searchParams.get("contextType");
    const contextRecordId=url.searchParams.get("contextRecordId");
    if(!["expense_request","bank_transaction"].includes(contextType)||!UUID.test(contextRecordId??""))
     throw new InputError(400,"A valid finance record context is required.");
    const contextPermission=contextType==="expense_request"?"finance.expenses_review":"finance.banking_review";
    const managePermission=contextType==="expense_request"?"finance.expenses_request":"finance.banking_manage";
    const allowed=["finance.evidence_manage","finance.evidence_review",contextPermission,managePermission]
      .some(permissionCode=>staffHasPermission({principal,permissionCode}));
    if(!allowed){json(res,403,{error:"You do not have permission to view matching financial evidence."});return true;}
   }else if(!staffHasPermission({principal,permissionCode:isDownload||isRead?"finance.evidence_manage":permission})&&
      !(isDownload||isRead?staffHasPermission({principal,permissionCode:"finance.evidence_review"}):false)){
    json(res,403,{error:"You do not have permission for this evidence operation."});return true;
   }
   if(listMatch){
    const contextType=url.searchParams.get("contextType");
    const contextRecordId=url.searchParams.get("contextRecordId");
    const items=await evidenceRepository.listRecordEvidenceRequests({
     actorStaffId:principal.id,contextType,recordId:contextRecordId
    });
    json(res,200,{items});return true;
   }
   if(create){
    const body=await readJson(req);
    if(typeof body.assignedStaffId!=="string"||!UUID.test(body.assignedStaffId)||
       !PURPOSES.has(body.purpose)||!CONTEXTS.has(body.contextType??"other")||
       typeof body.contextLabel!=="string"||body.contextLabel.trim().length<2||body.contextLabel.trim().length>180||
       ((body.contextType??"other")==="other"?(body.contextRecordId!=null):!UUID.test(body.contextRecordId??""))||
       (body.amountUgx!=null&&(!Number.isSafeInteger(body.amountUgx)||body.amountUgx<=0))){
      throw new InputError(400,"Evidence request details are invalid.");
    }
    const requestId=await evidenceRepository.createEvidenceRequest({
     actorStaffId:principal.id,assignedStaffId:body.assignedStaffId,purpose:body.purpose,
     contextType:body.contextType??"other",contextRecordId:body.contextRecordId??null,
     contextLabel:body.contextLabel.trim(),amountUgx:body.amountUgx??null
    });
    json(res,201,{requestId});return true;
   }
   const match=fileMatch??submitMatch??reviewMatch??requestMatch;
   if(match&&!UUID.test(match[1]))throw new InputError(400,"Evidence request ID is invalid.");
   if(fileMatch&&method==="POST"){
    const input=await readFile(req);
    const saved=await evidenceStore.put(input);
    try{
     const fileId=await evidenceRepository.registerEvidenceFile({
      actorStaffId:principal.id,requestId:fileMatch[1],...saved
     });
     json(res,201,{fileId,sha256:saved.sha256,sizeBytes:saved.sizeBytes,contentType:saved.contentType});return true;
    }catch(error){await evidenceStore.remove(saved.objectKey).catch(()=>{});throw error;}
   }
   if(submitMatch&&method==="POST"){
    await evidenceRepository.submitEvidenceRequest({actorStaffId:principal.id,requestId:submitMatch[1]});
    json(res,200,{status:"Submitted"});return true;
   }
   if(reviewMatch&&method==="POST"){
    const body=await readJson(req);
    if(!["Approved","Rejected","Needs clearer photo"].includes(body.action)||
       (body.note!=null&&(typeof body.note!=="string"||body.note.trim().length>500)))
     throw new InputError(400,"Choose a valid evidence decision and an optional note of at most 500 characters.");
    const status=await evidenceRepository.reviewEvidenceRequest({
     actorStaffId:principal.id,requestId:reviewMatch[1],action:body.action,note:body.note?.trim()||null
    });
    json(res,200,{status});return true;
   }
   if(requestMatch&&method==="GET"){
    const record=await evidenceRepository.getEvidenceRequest({actorStaffId:principal.id,requestId:requestMatch[1]});
    if(!record){json(res,404,{error:"The evidence request was not found."});return true;}
    json(res,200,{request:record});return true;
   }
   if(downloadMatch&&method==="GET"){
    if(!UUID.test(downloadMatch[1]))throw new InputError(400,"Evidence file ID is invalid.");
    const found=await evidenceRepository.findEvidenceFile({actorStaffId:principal.id,fileId:downloadMatch[1]});
    if(!found){json(res,404,{error:"The evidence file was not found."});return true;}
    const stored=await evidenceStore.get(found.storageObjectKey,found.sha256);
    const name=safeDownloadName(found.originalFileName);
    res.writeHead(200,{...HEADERS,"Content-Type":found.contentType,"Content-Length":stored.sizeBytes,
      "Content-Disposition":'attachment; filename="'+name+'"',"Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options":"nosniff"});
    res.end(stored.bytes);return true;
   }
   json(res,404,{error:"Evidence route not found."});return true;
  }catch(error){const mapped=mapError(error);json(res,mapped.status,{error:mapped.message,requestId:randomUUID()});return true;}
 };
}
