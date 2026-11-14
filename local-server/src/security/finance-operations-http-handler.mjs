import { randomUUID } from "node:crypto";
import { AuthenticationError, AuthenticationRateLimitError, AuthenticationServiceError, CsrfValidationError } from "./auth-service.mjs";
import { staffHasPermission } from "./authorization.mjs";
import { readSessionTokenFromCookieHeader } from "./session-cookies.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY=16*1024;
const HEADERS={
 "Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
 "X-Frame-Options":"DENY","Cross-Origin-Resource-Policy":"same-origin",
 "Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
 "Strict-Transport-Security":"max-age=86400"
};
class InputError extends Error{constructor(status,message){super(message);this.status=status;}}
function send(response,status,payload){
 const body=JSON.stringify(payload);
 response.writeHead(status,{...HEADERS,"Content-Type":"application/json; charset=utf-8","Content-Length":Buffer.byteLength(body)});
 response.end(body);
}
async function readBody(request){
 if(String(request.headers["content-type"]??"").split(";",1)[0].trim().toLowerCase()!=="application/json")
  throw new InputError(415,"JSON content is required.");
 const chunks=[];let size=0;
 for await(const chunk of request){size+=chunk.length;if(size>MAX_BODY)throw new InputError(413,"Request body is too large.");chunks.push(chunk);}
 if(!size)throw new InputError(400,"A JSON request body is required.");
 let value;try{value=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new InputError(400,"Request body is not valid JSON.");}
 if(!value||typeof value!=="object"||Array.isArray(value))throw new InputError(400,"Request body must be a JSON object.");
 return value;
}
function textField(body,key,min,max){
 const value=body[key];
 if(typeof value!=="string"||value.trim().length<min||value.trim().length>max)throw new InputError(400,"One or more required finance fields are invalid.");
 return value.trim();
}
function amountField(body,key){
 const value=body[key];
 if(!Number.isSafeInteger(value)||value<=0)throw new InputError(400,"Amount must be a positive whole-UGX number.");
 return value;
}
function mapError(error){
 if(error instanceof InputError)return {status:error.status,message:error.message};
 if(error instanceof AuthenticationRateLimitError)return {status:429,message:error.message};
 if(error instanceof AuthenticationError)return {status:401,message:"A valid staff session is required."};
 if(error instanceof CsrfValidationError)return {status:403,message:error.message};
 if(error instanceof AuthenticationServiceError)return {status:503,message:error.message};
 if(error?.code==="42501")return {status:403,message:"You do not have permission for this finance operation."};
 if(error?.code==="P0002")return {status:404,message:"The requested finance record was not found."};
 if(error?.code==="22023")return {status:400,message:"The finance request contains invalid information."};
 if(error?.code==="23514"||error?.code==="23505")return {status:409,message:"The finance operation conflicts with the current record or balance."};
 return {status:503,message:"The local finance service is temporarily unavailable."};
}

export function createFinanceOperationsHttpHandler({authService,financeRepository,expectedOrigin}={}){
 if(!authService||typeof authService.authenticate!=="function")throw new TypeError("A local authentication service is required.");
 const methods=[
  "listLocalExpenseCategories","listLocalBankAccounts","listLocalExpenseReviewQueue","listLocalBankReviewQueue","setLocalExpenseOperatorLimit","createLocalBankAccount","createLocalExpenseRequest","reviewLocalExpenseRequest",
  "postLocalExpense","createLocalBankTransaction","reviewLocalBankTransaction","verifyLocalBankTransaction",
  "attachLocalFinanceEvidence"
 ];
 for(const method of methods)if(!financeRepository||typeof financeRepository[method]!=="function")
  throw new TypeError("A complete expense and banking repository is required.");
 let origin;try{origin=new URL(expectedOrigin);}catch{throw new TypeError("Finance API origin must be a valid HTTPS origin.");}
 if(origin.protocol!=="https:"||origin.origin!==expectedOrigin||origin.pathname!=="/"||origin.username||origin.password||origin.search||origin.hash)
  throw new TypeError("Finance API origin must be an exact HTTPS origin.");

 return async function handleFinanceOperations(request,response){
  let url;try{url=new URL(request.url??"/",origin);}catch{return false;}
  const path=url.pathname;
  if(!path.startsWith("/api/v1/finance/"))return false;
  const routeTable=[
   {regex:/^\/api\/v1\/finance\/expense-categories$/,permission:"finance.expenses_request",kind:"categories",methods:["GET"]},
   {regex:/^\/api\/v1\/finance\/expense-review-queue$/,permission:null,kind:"expenseQueue",methods:["GET"]},
   {regex:/^\/api\/v1\/finance\/bank-review-queue$/,permission:null,kind:"bankQueue",methods:["GET"]},
   {regex:/^\/api\/v1\/finance\/bank-accounts$/,permission:"finance.banking_manage",kind:"bankAccounts",methods:["GET","POST"]},
   {regex:/^\/api\/v1\/finance\/expenses\/limits$/,permission:"finance.expenses_manage",kind:"limit"},
   {regex:/^\/api\/v1\/finance\/expenses$/,permission:"finance.expenses_request",kind:"expense"},
   {regex:/^\/api\/v1\/finance\/expenses\/([0-9a-f-]{36})\/review$/i,permission:"finance.expenses_review",kind:"expenseReview"},
   {regex:/^\/api\/v1\/finance\/expenses\/([0-9a-f-]{36})\/post$/i,permission:"finance.expenses_post",kind:"expensePost"},
   {regex:/^\/api\/v1\/finance\/bank-transactions$/,permission:"finance.banking_manage",kind:"bankTransaction"},
   {regex:/^\/api\/v1\/finance\/bank-transactions\/([0-9a-f-]{36})\/review$/i,permission:"finance.banking_review",kind:"bankReview"},
   {regex:/^\/api\/v1\/finance\/bank-transactions\/([0-9a-f-]{36})\/verify$/i,permission:"finance.banking_verify",kind:"bankVerify"},
   {regex:/^\/api\/v1\/finance\/(expenses|bank-transactions)\/([0-9a-f-]{36})\/evidence$/i,permission:null,kind:"evidence"}
  ];
  const matched=routeTable.map(route=>({route,match:path.match(route.regex)})).find(item=>item.match);
  if(!matched)return false;
  const method=String(request.method??"GET").toUpperCase();
  const allowedMethods=route.methods??["POST"];
  if(!allowedMethods.includes(method)){response.writeHead(405,{...HEADERS,Allow:allowedMethods.join(", "),"Content-Length":0});response.end();return true;}
  if(request.socket?.encrypted!==true){send(response,426,{error:"Secure HTTPS transport is required."});return true;}
  if(request.headers.host!==origin.host){send(response,421,{error:"Request host is not authorised."});return true;}
  if(method==="POST"&&request.headers.origin!==origin.origin){send(response,403,{error:"The request origin is not authorised."});return true;}
  try{
   const sessionToken=readSessionTokenFromCookieHeader(request.headers.cookie);
   const csrfHeader=request.headers["x-cornhill-csrf"];
   const principal=await authService.authenticate({sessionToken,method,csrfToken:typeof csrfHeader==="string"?csrfHeader:undefined});
   const {route,match}=matched;
   const permission=route.kind==="evidence"?(match[1].toLowerCase()==="expenses"?"finance.expenses_request":"finance.banking_manage"):route.kind==="expenseQueue"?(staffHasPermission({principal,permissionCode:"finance.expenses_review"})?"finance.expenses_review":"finance.expenses_post"):route.kind==="bankQueue"?(staffHasPermission({principal,permissionCode:"finance.banking_review"})?"finance.banking_review":"finance.banking_verify"):route.permission;
   const permitted=route.kind==="expenseQueue"?(staffHasPermission({principal,permissionCode:"finance.expenses_review"})||staffHasPermission({principal,permissionCode:"finance.expenses_post"})):route.kind==="bankQueue"?(staffHasPermission({principal,permissionCode:"finance.banking_review"})||staffHasPermission({principal,permissionCode:"finance.banking_verify"})):staffHasPermission({principal,permissionCode:permission});
   if(!permitted){send(response,403,{error:"You do not have permission for this finance operation."});return true;}
   const actorStaffId=principal.id;
   if(method==="GET"){
    const result=route.kind==="categories"?await financeRepository.listLocalExpenseCategories({actorStaffId}):route.kind==="bankAccounts"?await financeRepository.listLocalBankAccounts({actorStaffId}):route.kind==="expenseQueue"?await financeRepository.listLocalExpenseReviewQueue({actorStaffId}):await financeRepository.listLocalBankReviewQueue({actorStaffId});
    send(response,200,{items:result});return true;
   }
   const body=await readBody(request);
   let result;
   switch(route.kind){
    case "limit":
     if(typeof body.staffId!=="string"||!UUID.test(body.staffId))throw new InputError(400,"Select a valid staff member.");
     result=await financeRepository.setLocalExpenseOperatorLimit({actorStaffId,staffId:body.staffId,dailyLimitUgx:amountField(body,"dailyLimitUgx")});
     break;
    case "expense":
     result=await financeRepository.createLocalExpenseRequest({
      actorStaffId,requestNumber:"EXP-"+new Date().getUTCFullYear()+"-"+randomUUID().slice(0,8).toUpperCase(),
      categoryId:UUID.test(body.categoryId??"")?body.categoryId:(()=>{throw new InputError(400,"Select a valid expense category.");})(),
      description:textField(body,"description",5,500),amountUgx:amountField(body,"amountUgx")
     });
     break;
    case "expenseReview":
     if(!["Approved","Rejected"].includes(body.decision))throw new InputError(400,"Choose Approved or Rejected.");
     if(!UUID.test(match[1]))throw new InputError(400,"Expense request ID is invalid.");
     result=await financeRepository.reviewLocalExpenseRequest({actorStaffId,requestId:match[1],decision:body.decision,note:body.note==null?null:textField(body,"note",body.decision==="Rejected"?5:0,500)});
     break;
    case "expensePost":
     if(!UUID.test(match[1]))throw new InputError(400,"Expense request ID is invalid.");
     result=await financeRepository.postLocalExpense({actorStaffId,requestId:match[1]});
     break;
    case "bankAccounts":
     if(typeof body.last4!=="string"||!/^\d{4}$/.test(body.last4))throw new InputError(400,"Only the last four account digits may be supplied.");
     result=await financeRepository.createLocalBankAccount({actorStaffId,accountName:textField(body,"accountName",2,120),bankName:textField(body,"bankName",2,120),last4:body.last4,openingBalanceUgx:Number.isSafeInteger(body.openingBalanceUgx)&&body.openingBalanceUgx>=0?body.openingBalanceUgx:(()=>{throw new InputError(400,"Opening balance must be a non-negative whole-UGX amount.");})()});
     break;
    case "bankTransaction":
     if(typeof body.accountId!=="string"||!UUID.test(body.accountId))throw new InputError(400,"Select a valid bank account.");
     if(!["Deposit","Withdrawal"].includes(body.transactionType))throw new InputError(400,"Select Deposit or Withdrawal.");
     result=await financeRepository.createLocalBankTransaction({actorStaffId,accountId:body.accountId,transactionType:body.transactionType,amountUgx:amountField(body,"amountUgx"),description:textField(body,"description",5,500),externalReference:body.externalReference==null?null:textField(body,"externalReference",1,120)});
     break;
    case "bankReview":
     if(!["Approved","Rejected"].includes(body.decision))throw new InputError(400,"Choose Approved or Rejected.");
     if(!UUID.test(match[1]))throw new InputError(400,"Bank transaction ID is invalid.");
     result=await financeRepository.reviewLocalBankTransaction({actorStaffId,transactionId:match[1],decision:body.decision,note:body.note==null?null:textField(body,"note",body.decision==="Rejected"?5:0,500)});
     break;
    case "bankVerify":
     if(!UUID.test(match[1]))throw new InputError(400,"Bank transaction ID is invalid.");
     result=await financeRepository.verifyLocalBankTransaction({actorStaffId,transactionId:match[1]});
     break;
    case "evidence":
     if(!UUID.test(match[2]))throw new InputError(400,"Finance record ID is invalid.");
     if(typeof body.evidenceRequestId!=="string"||!UUID.test(body.evidenceRequestId))throw new InputError(400,"Select a valid evidence request.");
     result=await financeRepository.attachLocalFinanceEvidence({actorStaffId,contextType:match[1].toLowerCase()==="expenses"?"expense_request":"bank_transaction",recordId:match[2],evidenceRequestId:body.evidenceRequestId});
     break;
   }
   send(response,route.kind==="expense"||route.kind==="bankAccounts"||route.kind==="bankTransaction"||route.kind==="limit"?201:200,{result});
   return true;
  }catch(error){const mapped=mapError(error);send(response,mapped.status,{error:mapped.message,requestId:randomUUID()});return true;}
 };
}
