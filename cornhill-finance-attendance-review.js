/* CORNHILL review-only projections; authenticated verified server data required.
 * These functions do not post payments, assess charges, send alerts, or deduct salary.
 * Unknown balances must never become zero. Policy period is not inferred.
 */
(function(root){"use strict";
function feeReview(input) {
  if(!input||typeof input!=="object") throw new TypeError("Fee review required");
  if(input.assessmentVerified!==true) return {status:"unassessed",combined:null,previous:null,reminder:"unknown"};
  const {current,previous}=input;
  if(![current,previous].every(v=>Number.isSafeInteger(v)&&v>=0)||!Number.isSafeInteger(current+previous))throw new TypeError("Invalid verified balances");
  return {status:"assessed",combined:current+previous,previous,reminder:previous>0?"required":"none"};
}
function boardingChargeReview(input) {
  if(!input||typeof input!=="object")throw new TypeError("Charge review required");
  if(input.enrolmentVerified!==true||!["boarding","day"].includes(input.boardingStatus)||input.periodApproved!==true)return {status:"unverified",outstanding:null};
  if(input.boardingStatus==="day")return {status:"not_applicable",outstanding:null};
  if(!Array.isArray(input.obligations))return {status:"unassessed",outstanding:null};
  if(input.obligations.length>1)return {status:"conflict",outstanding:null};
  if(input.obligations.length===0)return {status:"unassessed",outstanding:null};
  const row=input.obligations[0];
  if(!row||row.periodMatches!==true||row.amountUgx!==3000||!Number.isSafeInteger(row.verifiedAllocatedUgx)||row.verifiedAllocatedUgx<0||row.verifiedAllocatedUgx>3000)return {status:"conflict",outstanding:null};
  return {status:row.verifiedAllocatedUgx===3000?"settled":"outstanding",outstanding:3000-row.verifiedAllocatedUgx};
}
function attendanceReview(input) {
  if(!input||typeof input!=="object")throw new TypeError("Attendance review required");
  const result=(status,recommendation=false)=>({status,recommendation,automaticDeduction:false});
  if(input.rosterVerified!==true||input.deviceVerified!==true||input.syncComplete!==true||input.workingDayVerified!==true)return result("unverified");
  if(input.expected!==true)return result("not_expected");
  if(input.disputed===true)return result("disputed");
  if(input.clockInVerified===true)return result("clocked_in");
  if(input.clockInVerified!==false||!Number.isSafeInteger(input.elapsedMinutes)||input.elapsedMinutes<0)return result("unverified");
  if(input.elapsedMinutes<120)return result("grace_period");
  if(input.reasonStatus==="approved")return result("excused");
  if(input.reasonStatus==="pending")return result("reason_pending");
  if(!["none","rejected"].includes(input.reasonStatus))return result("unverified");
  return input.allowDeduction===true?result("director_review_required",true):result("deduction_disabled");
}
const api=Object.freeze({feeReview,boardingChargeReview,attendanceReview});if(typeof module==="object"&&module.exports)module.exports=api;else root.CornhillFinanceAttendanceReview=api;
})(typeof globalThis==="object"?globalThis:this);
