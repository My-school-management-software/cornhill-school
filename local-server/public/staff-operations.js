(() => {
"use strict";
const $=id=>document.getElementById(id);
let principal=null,workspace=null;
const csrf=()=>{const prefix="__Host-cornhill_csrf=";const value=document.cookie.split(";").map(v=>v.trim()).find(v=>v.startsWith(prefix));return value?decodeURIComponent(value.slice(prefix.length)):"";};
async function api(path,{method="GET",body}={}){
  const headers={Accept:"application/json"};
  if(body!==undefined)headers["Content-Type"]="application/json";
  if(method!=="GET")headers["X-Cornhill-CSRF"]=csrf();
  const response=await fetch("/api/v1"+path,{method,headers,credentials:"same-origin",cache:"no-store",body:body===undefined?undefined:JSON.stringify(body)});
  let data={};try{data=await response.json();}catch{}
  if(!response.ok)throw new Error(data.error||"Staff request failed ("+response.status+").");
  return data;
}
function can(code){return (principal?.roles||[]).some(role=>(principal.rolePermissions?.[role]||[]).includes(code));}
function notice(message,bad=false){$("notice").textContent=message;$("notice").className="notice"+(bad?" error":"");}
function cell(row,value){const td=document.createElement("td");td.textContent=value==null||value===""?"—":String(value);row.append(td);return td;}
function empty(body,columns,message){body.replaceChildren();const row=document.createElement("tr"),td=document.createElement("td");td.colSpan=columns;td.className="empty";td.textContent=message;row.append(td);body.append(row);}
function number(value){const n=Number(value);return Number.isFinite(n)?n.toLocaleString("en-UG"):"—";}
function money(value){return "UGX "+number(value);}
function dateTime(value){if(!value)return "—";const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString();}
function dateOnly(value){if(!value)return "—";const d=new Date(value+"T00:00:00");return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString();}
function rows(body,items,columns,draw,message){body.replaceChildren();if(!items.length){empty(body,columns,message);return;}for(const item of items){const tr=document.createElement("tr");draw(tr,item);body.append(tr);}}
function showPanels(caps){
  $("attendance-panel").hidden=!caps.attendance;
  $("leave-panel").hidden=!caps.ownLeave;
  $("leave-review-panel").hidden=!caps.leaveReview;
  $("all-leave-balances-panel").hidden=!caps.allLeaveBalances;
  $("payroll-panel").hidden=!caps.payroll;
  $("leave-form").hidden=!caps.ownLeave;
}
function renderAttendance(data,canReview=false){
  rows($("attendance-rows"),data.recentDays||[],canReview?11:10,(tr,x)=>{
    cell(tr,dateOnly(x.workDate));cell(tr,x.staffNumber);cell(tr,x.staffName);cell(tr,x.jobTitle);
    cell(tr,x.status);cell(tr,dateTime(x.firstClockIn));cell(tr,dateTime(x.lastClockOut));
    cell(tr,x.workedMinutes);cell(tr,x.source);cell(tr,x.verifiedAt?"Verified":"Not verified");
    if(canReview){
      const action=cell(tr,"");action.replaceChildren();
      const decision=document.createElement("select");
      for(const value of ["Verified","Correction Required"]){const option=document.createElement("option");option.value=value;option.textContent=value;decision.append(option);}
      const note=document.createElement("input");note.type="text";note.maxLength=1000;note.placeholder="Review note";
      note.setAttribute("aria-label","Attendance review note for "+x.staffName);
      const button=document.createElement("button");button.type="button";button.textContent="Save review";
      button.addEventListener("click",async()=>{
        if(note.value.trim().length<5){notice("Enter an attendance review note of at least five characters.",true);note.focus();return;}
        button.disabled=true;
        try{
          await api("/staff/attendance/days/"+encodeURIComponent(x.id)+"/review",{method:"POST",body:{reviewStatus:decision.value,reviewNote:note.value.trim()}});
          notice("Attendance review recorded in the append-only review history.");
          await loadWorkspace();
        }catch(error){notice(error.message,true);button.disabled=false;}
      });
      action.append(decision,note,button);
    }
  },"No staff attendance records exist in the last 30 days.");
  rows($("monthly-rows"),data.monthly||[],10,(tr,x)=>{
    cell(tr,x.monthStart);cell(tr,x.staffNumber);cell(tr,x.staffName);cell(tr,x.recordedDays);
    cell(tr,x.presentDays);cell(tr,x.lateDays);cell(tr,x.absentDays);cell(tr,x.halfDays);
    cell(tr,x.leaveDays);cell(tr,x.workedMinutes);
  },"No monthly attendance summaries are available.");
  rows($("attendance-review-rows"),data.reviewQueue||[],6,(tr,x)=>{
    cell(tr,dateOnly(x.workDate));cell(tr,x.staffNumber);cell(tr,x.staffName);
    cell(tr,x.reviewStatus||"Not reviewed");cell(tr,x.reviewNote);cell(tr,dateTime(x.reviewedAt));
  },"No daily attendance review events are recorded.");
}
function renderLeave(data){
  rows($("leave-rows"),data.ownRequests||[],7,(tr,x)=>{
    cell(tr,x.leaveType);cell(tr,dateOnly(x.startsOn));cell(tr,dateOnly(x.endsOn));
    cell(tr,x.requestedDays);cell(tr,x.status);cell(tr,dateTime(x.submittedAt));cell(tr,x.reviewNote);
  },"You have not submitted any leave requests.");
  rows($("leave-balance-rows"),data.balances||[],2,(tr,x)=>{
    cell(tr,x.leaveType);cell(tr,x.availableDays);
  },"No leave balance entries have been recorded for your account.");
  $("leave-review-count").textContent=(data.reviewQueue||[]).length+" pending requests";
  rows($("leave-review-rows"),data.reviewQueue||[],9,(tr,x)=>{
    cell(tr,x.staffNumber);cell(tr,x.legalName);cell(tr,x.leaveType);cell(tr,dateOnly(x.startsOn));
    cell(tr,dateOnly(x.endsOn));cell(tr,x.requestedDays);cell(tr,x.reason);cell(tr,dateTime(x.submittedAt));
    const actions=cell(tr,"");actions.replaceChildren();
    const note=document.createElement("input");note.type="text";note.maxLength=1200;
    note.placeholder="Review note";note.setAttribute("aria-label","Review note for "+x.legalName);
    const approve=document.createElement("button");approve.type="button";approve.textContent="Approve";
    const reject=document.createElement("button");reject.type="button";reject.textContent="Reject";reject.className="secondary";
    const act=async decision=>{
      const value=note.value.trim();
      if(decision==="Rejected"&&value.length<5){notice("Enter a rejection reason of at least five characters.",true);note.focus();return;}
      approve.disabled=true;reject.disabled=true;
      try{
        await api("/staff/leave/requests/"+encodeURIComponent(x.id)+"/review",{method:"POST",body:{decision,note:value}});
        notice("Leave request "+decision.toLowerCase()+". Balance usage remains a separate controlled action.");
        await loadWorkspace();
      }catch(error){notice(error.message,true);approve.disabled=false;reject.disabled=false;}
    };
    approve.addEventListener("click",()=>act("Approved"));
    reject.addEventListener("click",()=>act("Rejected"));
    actions.append(note,approve,reject);
  },"The leave review queue is empty.");
  rows($("all-leave-balance-rows"),data.allBalances||data.balances||[],4,(tr,x)=>{
    cell(tr,x.staffNumber);cell(tr,x.staffName);cell(tr,x.leaveType);cell(tr,x.availableDays);
  },"No staff leave balances have been recorded.");
}
function renderPayroll(data){
  rows($("payroll-period-rows"),data.periods||[],5,(tr,x)=>{
    cell(tr,x.periodCode);cell(tr,dateOnly(x.startsOn));cell(tr,dateOnly(x.endsOn));
    cell(tr,dateOnly(x.paymentDate));cell(tr,x.status);
  },"No payroll periods have been created.");
  rows($("payroll-run-rows"),data.runs||[],9,(tr,x)=>{
    cell(tr,x.periodCode);cell(tr,x.status);cell(tr,x.staffCount);cell(tr,money(x.grossPayUgx));
    cell(tr,money(x.netPayUgx));cell(tr,money(x.verifiedPaidUgx));
    cell(tr,money(x.pendingVerificationUgx));cell(tr,money(x.remainingUnallocatedUgx));
    cell(tr,dateTime(x.postedAt));
  },"No payroll runs have been prepared.");
  rows($("payroll-line-rows"),data.lines||[],8,(tr,x)=>{
    cell(tr,x.periodCode);cell(tr,x.staffNumber);cell(tr,x.staffName);
    cell(tr,money(x.baseSalaryUgx));cell(tr,money(x.allowancesUgx));
    cell(tr,money(x.deductionsUgx));cell(tr,money(x.grossPayUgx));cell(tr,money(x.netPayUgx));
  },"No payroll line details are available.");
}
async function loadWorkspace(){
  const result=await api("/staff/operations/workspace");
  workspace=result;
  const caps=result.capabilities||{};
  showPanels(caps);
  if(caps.attendance)renderAttendance(result.attendance||{});
  if(caps.ownLeave||caps.leaveReview||caps.allLeaveBalances)renderLeave({
    ...(result.leave||{}),
    allBalances:caps.allLeaveBalances?(result.leave?.allBalances||[]):undefined
  });
  if(caps.payroll)renderPayroll(result.payroll||{});
  const enabled=Object.values(caps).filter(Boolean).length;
  if(!enabled)throw new Error("Your staff account has no Staff Operations permissions.");
  notice("Staff Operations refreshed. Only sections permitted to your account are displayed.");
}
function showApp(){
  $("login").hidden=true;$("app").hidden=false;
  $("staff-name").textContent=principal.displayName||principal.name||"Staff member";
  $("staff-roles").textContent=(principal.roles||[]).join(" · ");
}
$("login-form").addEventListener("submit",async event=>{
  event.preventDefault();
  try{
    const result=await api("/auth/staff/login",{method:"POST",body:{username:$("username").value,password:$("password").value}});
    principal=result.principal;showApp();await loadWorkspace();
  }catch(error){notice(error.message,true);}
});
$("refresh").addEventListener("click",async()=>{try{await loadWorkspace();}catch(error){notice(error.message,true);}});
$("logout").addEventListener("click",async()=>{
  try{await api("/auth/logout",{method:"POST",body:{}});}catch{}
  principal=null;workspace=null;$("app").hidden=true;$("login").hidden=false;notice("You have signed out.");
});
$("leave-form").addEventListener("submit",async event=>{
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  const body={
    leaveType:form.get("leaveType"),startsOn:form.get("startsOn"),endsOn:form.get("endsOn"),
    requestedDays:Number(form.get("requestedDays")),reason:form.get("reason")
  };
  const button=event.currentTarget.querySelector("button[type=submit]");
  button.disabled=true;$("leave-message").textContent="Submitting request…";
  try{
    const result=await api("/staff/leave/requests",{method:"POST",body});
    $("leave-message").textContent="Submitted for independent review.";
    event.currentTarget.reset();
    await loadWorkspace();
    notice("Leave request submitted: "+result.leaveRequest.id);
  }catch(error){$("leave-message").textContent=error.message;notice(error.message,true);}
  finally{button.disabled=false;}
});
(async()=>{
  try{
    const session=await api("/auth/session");
    principal=session.principal;
    showApp();
    try{await loadWorkspace();}
    catch(error){notice(error.message,true);}
  }catch{
    $("app").hidden=true;
    $("login").hidden=false;
    notice("Local Staff Operations service connected. Sign in with your staff account.");
  }
})();
})();