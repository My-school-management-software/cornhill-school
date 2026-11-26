"use strict";
document.addEventListener("DOMContentLoaded",()=>{
const el=id=>document.getElementById(id);
const bind=(form,output,fn)=>el(form).addEventListener("submit",e=>{e.preventDefault();try{el(output).textContent=fn();}catch(err){el(output).textContent="Invalid test input: "+err.message;}});
const req={id:"synthetic-requirement",learnerId:"synthetic-learner",termId:"synthetic-term",classId:"synthetic-p6"};
bind("materials","materialResult",()=>{
 const quantity=Number(el("required").value), delivered=Number(el("delivered").value);
 const result=CornhillRequirementsProjection.projectRequirement({requirement:el("unassessed").checked?null:{...req,quantity},deliveries:delivered===0?[]:[{id:"synthetic-delivery",requirementId:req.id,learnerId:req.learnerId,termId:req.termId,classId:req.classId,quantity:delivered,status:el("deliveryStatus").value}]});
 return "Status: "+result.status+"\nRequired: "+(result.required??"Unknown")+"\nVerified received: "+(result.received??"Unknown")+"\nOutstanding: "+(result.outstanding??"Unknown");
});
bind("custody","custodyResult",()=>{
 const acknowledgements=[["teacher","teacher"],["store","store"]].filter(([field])=>el(field).value!=="none").map(([field,staffId])=>({staffId,accepted:el(field).value==="yes"}));
 return "Handover: "+CornhillRequirementsProjection.projectHandover({fromStaffId:"teacher",toStaffId:"store",quantity:2,acknowledgements});
});
bind("sms","smsResult",()=>{
 const verified=el("verified").checked;
 const result=CornhillSmsPreflight.previewSmsEligibility({policy:{enabled:el("enabled").checked,providerVerified:verified,senderApproved:verified,templateApproved:verified,verifiedUnitPriceUgx:50,dailyBudgetUgx:Number(el("budget").value),monthlyBudgetUgx:1000,dailyCommittedUgx:0,monthlyCommittedUgx:0},recipient:{consent:el("consent").checked,linkVerified:true,phoneVerified:true},message:{approved:true,idempotencyKey:"synthetic-only",alreadyQueuedOrSent:el("duplicate").checked,verifiedBillableUnits:2}});
 return "Eligible for simulated preview: "+(result.eligible?"Yes":"No")+"\nReason: "+result.reason+"\nEstimated test cost: "+(result.estimatedCostUgx??"Unavailable")+"\nNo SMS sent.";
});
});