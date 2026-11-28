// CORNHILL V49: office -> teacher -> learner usage/return; Director authorizes surplus.
// No finance postings, cloud sync, or automatic recognition of personal profit.
import {validateNurseryMaterialCollection} from "./nursery-materials-contract.mjs";

export const MATERIAL_MOVEMENT_TYPES=Object.freeze([
  "teacher_issue","teacher_return","learner_used","director_surplus"
]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
export function validateMovementInput(input,{learnerId}={}){
 if(!input || typeof input!=="object" || Array.isArray(input)) throw new TypeError("Movement details required.");
 const allowed=new Set(["requestId","materialName","movementType","quantity","movementDate","teacherStaffId","surplusUnitValueUgx","reason"]);
 for(const key of Object.keys(input))if(!allowed.has(key))throw new TypeError("Unknown movement field.");
 if(!UUID.test(learnerId??"")||!UUID.test(input.requestId??""))throw new TypeError("One valid learner and request id are required.");
 const materialName=input.materialName;
 if(typeof materialName!=="string"||materialName.trim().length<2||materialName.trim().length>100||
     /[\x00-\x1f\x7f]/.test(materialName))throw new TypeError("Material name invalid.");
 if(!MATERIAL_MOVEMENT_TYPES.includes(input.movementType))throw new TypeError("Movement type invalid.");
 if(!Number.isSafeInteger(input.quantity)||input.quantity<1||input.quantity>1000)throw new TypeError("Quantity invalid.");
 const date=input.movementDate;
 if(typeof date!=="string"||!DATE.test(date))throw new TypeError("Movement date invalid.");
 const [y,m,d]=date.split("-").map(Number),parsed=new Date(Date.UTC(y,m-1,d));
 if(y<2000||y>2200||parsed.getUTCFullYear()!==y||parsed.getUTCMonth()+1!==m||parsed.getUTCDate()!==d)
   throw new TypeError("Movement date invalid.");
 const reason=input.reason;
 if(typeof reason!=="string"||reason.trim().length<3||reason.trim().length>300||
    /[\x00-\x1f\x7f]/.test(reason))throw new TypeError("Reason required.");
 const directorSurplus=input.movementType==="director_surplus";
 const teacherStaffId=input.teacherStaffId??null;
 if(directorSurplus){
   if(teacherStaffId!==null)throw new TypeError("Director surplus cannot be issued to a teacher.");
   if(!Number.isSafeInteger(input.surplusUnitValueUgx)||input.surplusUnitValueUgx<0||input.surplusUnitValueUgx>1_000_000_000)
     throw new TypeError("Director surplus needs a reviewed UGX unit valuation.");
 }else{
   if(!UUID.test(teacherStaffId??""))throw new TypeError("A verified receiving teacher must be selected.");
   if(input.surplusUnitValueUgx!==undefined&&input.surplusUnitValueUgx!==null)
     throw new TypeError("Valuation is only for approved surplus transfers.");
 }
 return Object.freeze({
   learnerId:learnerId.toLowerCase(),requestId:input.requestId.toLowerCase(),
   materialName:materialName.trim().normalize("NFC"),
   movementType:input.movementType,quantity:input.quantity,movementDate:date,
   teacherStaffId:teacherStaffId?.toLowerCase()??null,
   surplusUnitValueUgx:directorSurplus?input.surplusUnitValueUgx:null,
   reason:reason.trim().normalize("NFC")
 });
}
export function reconcileNurseryMaterialStock({received,issued,returned,used,surplus,teacherIssued=0,teacherReturned=0,teacherUsed=0}){
 const values=[received,issued,returned,used,surplus,teacherIssued,teacherReturned,teacherUsed];
 if(values.some(x=>!Number.isSafeInteger(x)||x<0))throw new TypeError("Invalid stock ledger totals.");
 const office=received-issued+returned-surplus;
 const teacherCustody=issued-returned-used;
 const thisTeacherCustody=teacherIssued-teacherReturned-teacherUsed;
 if(![office,teacherCustody,thisTeacherCustody].every(Number.isSafeInteger)||
    office<0||teacherCustody<0||thisTeacherCustody<0)throw new RangeError("Material stock reconciliation conflict.");
 return Object.freeze({received,issued,returned,used,surplus,
   officeRemaining:office,teacherOutstanding:teacherCustody,teacherHolding:thisTeacherCustody,
   totalPhysicalRemaining:office+teacherCustody});
}
