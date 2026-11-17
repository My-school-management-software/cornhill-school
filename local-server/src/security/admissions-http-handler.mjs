import { randomUUID } from "node:crypto";
import { AuthenticationError, AuthenticationServiceError, CsrfValidationError } from "./auth-service.mjs";
import { AuthorizationError, isLocalUuid, staffHasClassAssignment, staffHasPermission } from "./authorization.mjs";
import { readSessionTokenFromCookieHeader, readCsrfTokenFromCookieHeader } from "./session-cookies.mjs";

const MAX_BODY = 16 * 1024;
const HEADERS = Object.freeze({
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
  "X-Frame-Options":"DENY","Cross-Origin-Resource-Policy":"same-origin",
  "Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Strict-Transport-Security":"max-age=86400"
});
class InputError extends Error { constructor(message,status=400){super(message);this.status=status;} }
function send(res,status,payload){const body=Buffer.from(JSON.stringify(payload));res.writeHead(status,{...HEADERS,"Content-Type":"application/json; charset=utf-8","Content-Length":body.length});res.end(body);}
async function readBody(req){
  if(String(req.headers["content-type"]??"").split(";",1)[0].trim().toLowerCase()!=="application/json") throw new InputError("JSON content is required.",415);
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw new InputError("Request body is too large.",413);chunks.push(chunk);}
  let value;try{value=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new InputError("Request body is not valid JSON.");}
  if(!value||typeof value!=="object"||Array.isArray(value))throw new InputError("A JSON object is required.");
  return value;
}
function text(value,max,label,required=true){if(value==null&&!required)return null;if(typeof value!=="string"|| (required&&value.trim().length===0)||value.trim().length>max)throw new InputError(label+" is invalid.");return value.trim()||null;}
function isCalendarDate(value){
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [year,month,day]=value.split("-").map(Number);
  const parsed=new Date(Date.UTC(year,month-1,day));
  return parsed.getUTCFullYear()===year&&parsed.getUTCMonth()===month-1&&parsed.getUTCDate()===day;
}
function validate(body,actorStaffId){
  const classId=body.classId==null||body.classId===""?null:body.classId;
  if(classId!==null&&!isLocalUuid(classId))throw new InputError("Select a valid class.");
  const firstName=text(body.firstName,80,"First name"),lastName=text(body.lastName,80,"Last name");
  const middleName=text(body.middleName,80,"Middle name",false);
  if(!["Male","Female"].includes(body.gender))throw new InputError("Select Male or Female.");
  const dateOfBirth=body.dateOfBirth==null||body.dateOfBirth===""?null:text(body.dateOfBirth,10,"Date of birth");
  const admissionDate=text(body.admissionDate,10,"Admission date");
  for(const [v,label] of [[dateOfBirth,"Date of birth"],[admissionDate,"Admission date"]]) {
    if(v&&!isCalendarDate(v))throw new InputError(label+" must be a valid calendar date in YYYY-MM-DD format.");
  }
  if(dateOfBirth&&dateOfBirth>admissionDate)throw new InputError("Date of birth cannot be after the admission date.");
  if(body.learnerType!==undefined&&!["Day","Boarding"].includes(body.learnerType))throw new InputError("Learner category must be Day or Boarding.");
  const lin=text(body.lin,40,"LIN",false);
  if(body.isBursary!==undefined&&typeof body.isBursary!=="boolean")throw new InputError("Bursary flag must be true or false.");
  const isBursary=body.isBursary===true;
  const bursaryFeeUgx=isBursary?body.bursaryFeeUgx:0;
  if(!Number.isSafeInteger(bursaryFeeUgx)||bursaryFeeUgx<0||(!isBursary&&body.bursaryFeeUgx!=null&&body.bursaryFeeUgx!==0))throw new InputError("Bursary amount must be a non-negative whole-UGX amount.");
  let guardian=null;
  if(body.guardian!=null){
    const g=body.guardian;if(!g||typeof g!=="object"||Array.isArray(g))throw new InputError("Guardian details are invalid.");
    if(g.smsOptIn!=null&&typeof g.smsOptIn!=="boolean")throw new InputError("Guardian SMS consent must be true or false.");
    if(g.whatsappOptIn!=null&&typeof g.whatsappOptIn!=="boolean")throw new InputError("Guardian WhatsApp consent must be true or false.");
    const phone=text(g.phone,13,"Guardian phone",false),whatsapp=text(g.whatsapp,13,"Guardian WhatsApp",false);
    if(phone&&!/^\+256[0-9]{9}$/.test(phone))throw new InputError("Guardian phone must use Uganda format +256XXXXXXXXX.");
    if(whatsapp&&!/^\+256[0-9]{9}$/.test(whatsapp))throw new InputError("Guardian WhatsApp must use Uganda format +256XXXXXXXXX.");
    const email=text(g.email,254,"Guardian email",false);
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new InputError("Guardian email is invalid.");
    guardian={name:text(g.name,140,"Guardian name"),relationship:text(g.relationship,60,"Guardian relationship",false),phone,whatsapp,email,smsOptIn:g.smsOptIn===true,whatsappOptIn:g.whatsappOptIn===true};
    if((guardian.smsOptIn&&!phone)||(guardian.whatsappOptIn&&!whatsapp))throw new InputError("A contact number is required for each communication consent.");
  }
  return {actorStaffId,classId,firstName,middleName,lastName,gender:body.gender,dateOfBirth,lin,admissionDate,
    learnerType:body.learnerType??"Day",previousSchool:text(body.previousSchool,160,"Previous school",false),
    p7IndexNumber:text(body.p7IndexNumber,40,"P.7 index number",false),isBursary,bursaryFeeUgx,
    bursaryCategory:isBursary?text(body.bursaryCategory,80,"Bursary category",false):null,
    bursaryReason:isBursary?text(body.bursaryReason,300,"Bursary reason",false):null,
    takesBreakfast:body.takesBreakfast===true,takesLunch:body.takesLunch===true,
    reason:text(body.reason,300,"Admission reason",false),guardian};
}
function validateProgression(body,learnerId,actorStaffId){
  if(!Object.hasOwn(body,"classId"))throw new InputError("Choose a destination class or explicitly record P.7 completion.");
  const toClassId=body.classId===null?null:body.classId;
  if(toClassId!==null&&!isLocalUuid(toClassId))throw new InputError("Select a valid destination class.");
  if(!isLocalUuid(body.academicTermId))throw new InputError("Choose the academic term for this progression.");
  if(!isCalendarDate(body.effectiveDate))throw new InputError("Progression date must be a valid calendar date in YYYY-MM-DD format.");
  const reason=text(body.reason,300,"Progression reason");
  if(reason.length<2)throw new InputError("Progression reason is too short.");
  return {learnerId,actorStaffId,toClassId,academicTermId:body.academicTermId,effectiveDate:body.effectiveDate,reason};
}
export function createAdmissionsHttpHandler({authService,admissionsRepository,expectedOrigin}={}){
  if(!authService||typeof authService.authenticate!=="function"||!admissionsRepository||typeof admissionsRepository.registerLearner!=="function")throw new TypeError("Admissions API dependencies are incomplete.");
  const origin=new URL(expectedOrigin);if(origin.protocol!=="https:"||origin.origin!==expectedOrigin||origin.pathname!=="/")throw new TypeError("An exact HTTPS origin is required.");
  return async function handleAdmissions(request,response){
    let url;try{url=new URL(request.url??"/",origin);}catch{return false;}
    const progressionMatch=url.pathname.match(/^\/api\/v1\/school\/learners\/([0-9a-f-]{36})\/progression$/i);
    const isAdmissions=url.pathname==="/api/v1/school/admissions";
    if(!isAdmissions&&!progressionMatch)return false;
    const method=String(request.method??"GET").toUpperCase();
    if(method!=="POST"){response.writeHead(405,{...HEADERS,Allow:"POST","Content-Length":0});response.end();return true;}
    if(request.socket?.encrypted!==true){send(response,426,{error:"Secure HTTPS transport is required."});return true;}
    if(request.headers.host!==origin.host||request.headers.origin!==origin.origin){send(response,421,{error:"Request origin is not authorised."});return true;}
    try{
      const principal=await authService.authenticate({sessionToken:readSessionTokenFromCookieHeader(request.headers.cookie),method,csrfToken:request.headers["x-cornhill-csrf"] ?? readCsrfTokenFromCookieHeader(request.headers.cookie)});
      if(progressionMatch){
        if(principal.principalType!=="staff"||!staffHasPermission({principal,permissionCode:"learners.manage"}))throw new AuthorizationError();
        if(typeof admissionsRepository.progressLearner!=="function")throw new Error("Learner progression is not available.");
        const input=validateProgression(await readBody(request),progressionMatch[1],principal.id);
        const progression=await admissionsRepository.progressLearner(input);
        send(response,201,{progression});
        return true;
      }
      if(principal.principalType!=="staff"||!staffHasPermission({principal,permissionCode:"admissions.register_learner"}))throw new AuthorizationError();
      const body=validate(await readBody(request),principal.id);
      if(body.lin&&!staffHasPermission({principal,permissionCode:"learners.lin_manage"}))throw new AuthorizationError();
      if(body.guardian&&!staffHasPermission({principal,permissionCode:"learners.guardians_manage"}))throw new AuthorizationError();
      const scoped=new Set(["teacher","class_teacher","upper_primary_teacher","lower_primary_teacher","nursery_head"]);
      if(principal.roles.some(role=>scoped.has(role))&&(!body.classId||!staffHasClassAssignment({principal,classId:body.classId})))throw new AuthorizationError();
      const learner=await admissionsRepository.registerLearner(body);
      send(response,201,{learner});
    }catch(error){
      if(error instanceof InputError)send(response,error.status,{error:error.message});
      else if(error instanceof AuthenticationError)send(response,401,{error:"A valid staff session is required."});
      else if(error instanceof AuthorizationError)send(response,403,{error:"You are not authorised to register this learner."});
      else if(error instanceof CsrfValidationError)send(response,403,{error:"The request could not be verified."});
      else if(error instanceof AuthenticationServiceError)send(response,503,{error:"Authentication is temporarily unavailable."});
      else if(error?.code==="42501")send(response,403,{error:"You are not authorised to manage this learner's class history."});
      else if(error?.code==="23514"||error?.code==="23503")send(response,409,{error:"The requested progression conflicts with the learner's current enrolment or academic term."});
      else if(error?.code==="22023")send(response,400,{error:"Progression details are invalid."});
      else if(error?.code==="23505")send(response,409,{error:"The LIN or learner details conflict with an existing record."});
      else send(response,503,{error:"Learner admission could not be completed.",requestId:randomUUID()});
    }
    return true;
  };
}
