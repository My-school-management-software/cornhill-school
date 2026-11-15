(() => {
"use strict";
const $ = id => document.getElementById(id);
let principal = null;
let workspace = null;
const csrf = () => {
  const prefix = "__Host-cornhill_csrf=";
  const value = document.cookie.split(";").map(v => v.trim()).find(v => v.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : "";
};
async function api(path, { method = "GET", body } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-Cornhill-CSRF"] = csrf();
  const response = await fetch("/api/v1" + path, {
    method, headers, credentials: "same-origin", cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || "Staff request failed (" + response.status + ").");
  return data;
}
function can(code) {
  return (principal?.roles || []).some(role => (principal.rolePermissions?.[role] || []).includes(code));
}
function notice(message, bad = false) { $("notice").textContent = message; $("notice").className = "notice" + (bad ? " error" : ""); }
function cell(row, value) { const td=document.createElement("td");td.textContent=value ?? "—";row.append(td);return td; }
function empty(host, message) { host.replaceChildren();const div=document.createElement("div");div.className="empty";div.textContent=message;host.append(div); }
function renderAttendance() {
  const data=workspace.attendance||[], summary=workspace.summary||{};
  $("attendance-panel").hidden=false;
  $("attendance-date").textContent=new Date().toLocaleDateString();
  $("staff-total").textContent=summary.activeStaff??"—";
  $("staff-present").textContent=summary.presentToday??0;
  $("staff-late").textContent=summary.lateToday??0;
  $("staff-absent").textContent=summary.absentToday??0;
  const host=$("attendance-rows");host.replaceChildren();
  if(!data.length){empty(host,"No attendance-day records have been entered for today.");return;}
  for(const item of data){
    const row=document.createElement("tr");
    cell(row,item.staffName);cell(row,item.jobTitle);
    cell(row,item.firstClockIn?new Date(item.firstClockIn).toLocaleTimeString():"—");
    cell(row,item.lastClockOut?new Date(item.lastClockOut).toLocaleTimeString():"—");
    cell(row,item.status);cell(row,item.workedMinutes);
    cell(row,item.verifiedAt?"Verified":"Awaiting verification");host.append(row);
  }
}
function renderStaff() {
  const data=workspace.staff||[];$("staff-panel").hidden=false;
  $("staff-count").textContent=data.length+" active / current profiles";
  const host=$("staff-rows");host.replaceChildren();
  if(!data.length){empty(host,"No staff profiles have been registered yet.");return;}
  for(const item of data){const row=document.createElement("tr");cell(row,item.staffNumber);cell(row,item.displayName);cell(row,item.jobTitle);cell(row,item.department);cell(row,item.employmentStatus);cell(row,item.hiredOn);host.append(row);}
}
function addActionForm(parent, title, fields, submitLabel, onSubmit) {
  const form=document.createElement("form");
  const heading=document.createElement("strong");heading.textContent=title;form.append(heading);
  const controls={};
  for(const field of fields){
    const label=document.createElement("label");label.textContent=field.label;
    const input=field.type==="textarea"?document.createElement("textarea"):document.createElement("input");
    if(field.type!=="textarea")input.type=field.type||"text";
    if(field.required)input.required=true;
    if(field.min)input.min=String(field.min);
    if(field.max)input.max=String(field.max);
    if(field.maxLength)input.maxLength=field.maxLength;
    input.placeholder=field.placeholder||"";
    label.append(input);form.append(label);controls[field.name]=input;
  }
  const button=document.createElement("button");button.type="submit";button.textContent=submitLabel;form.append(button);
  form.addEventListener("submit",async event=>{event.preventDefault();button.disabled=true;try{await onSubmit(controls);await loadWorkspace();}catch(error){notice(error.message,true);}finally{button.disabled=false;}});
  parent.append(form);
}
function renderIncidents() {
  const items=workspace.incidents||[];$("incidents-panel").hidden=false;
  $("incident-count").textContent=items.length+" recent incidents";
  const host=$("incidents-list");host.replaceChildren();
  if(!items.length){empty(host,"There are no attendance incidents in the last 30 days.");return;}
  for(const item of items){
    const card=document.createElement("article");card.className="incident";
    const head=document.createElement("div");head.className="incident-head";
    const title=document.createElement("div");const h=document.createElement("h3");h.textContent=item.staffName+" · "+item.incidentType.replaceAll("_"," ");title.append(h);
    const p=document.createElement("p");p.textContent=item.staffNumber+" · "+item.attendanceDate+" · "+item.jobTitle;title.append(p);
    const pill=document.createElement("span");pill.className="pill";pill.textContent=item.status;head.append(title,pill);card.append(head);
    const deadline=document.createElement("p");deadline.textContent="Review deadline: "+new Date(item.reviewDeadlineAt).toLocaleString();card.append(deadline);
    if(item.headteacherStatement){const statement=document.createElement("p");statement.textContent="Headteacher/DOS statement: "+item.headteacherStatement;card.append(statement);}
    if(item.directorDecision){const decision=document.createElement("p");decision.textContent="Director decision: "+item.directorDecision+" · approved amount UGX "+Number(item.approvedDeductionUgx).toLocaleString();card.append(decision);}
    if(item.reviewNote){const note=document.createElement("p");note.textContent="Director note: "+item.reviewNote;card.append(note);}
    const actions=document.createElement("div");actions.className="incident-actions";
    if(can("staff.attendance_statement_submit")&&!item.headteacherStatement&&!item.directorDecision){
      addActionForm(actions,"Headteacher / DOS statement",[{name:"statement",label:"Statement or explanation",type:"textarea",required:true,min:8,maxLength:1500}],
        "Record statement",async values=>{await api("/staff/attendance/incidents/"+item.id+"/statement",{method:"POST",body:{statement:values.statement.value}});notice("Leadership statement recorded.");});
    }
    if(can("staff.attendance_incident_decide")&&!item.directorDecision){
      addActionForm(actions,"Director decision",[
        {name:"decision",label:"Decision (excused / deduct)",placeholder:"Type excused or deduct",required:true},
        {name:"deductionUgx",label:"Deduction amount (UGX)",type:"number",min:1,max:100000000},
        {name:"reviewNote",label:"Review note",type:"textarea",maxLength:1000}
      ],"Submit Director decision",async values=>{
        const decision=values.decision.value.trim().toLowerCase();
        await api("/staff/attendance/incidents/"+item.id+"/decision",{method:"POST",body:{decision,deductionUgx:decision==="deduct"?Number(values.deductionUgx.value):0,reviewNote:values.reviewNote.value||null}});
        notice("Director decision recorded. Any payroll posting remains a separate approval workflow.");
      });
    }
    if(actions.childElementCount)card.append(actions);
    host.append(card);
  }
}
function renderSessions() {
  const items=workspace.prepSessions||[];$("sessions-panel").hidden=false;
  const host=$("sessions-list");host.replaceChildren();
  if(!items.length){empty(host,"No special preparation sessions are scheduled in the next 30 days.");return;}
  for(const item of items){const card=document.createElement("div");card.className="session";const name=document.createElement("strong");name.textContent=item.title+" · "+item.className;card.append(name);const meta=document.createElement("span");meta.textContent=item.prepDate+" · "+item.startTime+"–"+item.endTime+" · "+item.approvalStatus+(item.isPublished?" · Published":"");card.append(meta);host.append(card);}
}
async function loadWorkspace(){
  workspace=await api("/staff/leadership/workspace");
  $("attendance-panel").hidden=!can("staff.attendance_manage");
  $("staff-panel").hidden=!can("staff.profile_manage");
  $("incidents-panel").hidden=!(can("staff.attendance_statement_submit")||can("staff.attendance_incident_decide"));
  $("sessions-panel").hidden=!can("staff.prep_session_manage");
  if(can("staff.attendance_manage"))renderAttendance();
  if(can("staff.profile_manage"))renderStaff();
  if(can("staff.attendance_statement_submit")||can("staff.attendance_incident_decide"))renderIncidents();
  if(can("staff.prep_session_manage"))renderSessions();
  notice("Leadership workspace loaded. Only records permitted by your assigned staff permissions are displayed.");
}
async function start(){
  $("login").hidden=true;$("app").hidden=false;
  $("staff-name").textContent=principal.displayName||"Staff member";
  $("staff-roles").textContent=(principal.roles||[]).join(" · ");
  try{await loadWorkspace();}catch(error){notice(error.message,true);}
}
$("login-form").addEventListener("submit",async event=>{
  event.preventDefault();
  try{
    const result=await api("/auth/staff/login",{method:"POST",body:{username:$("username").value,password:$("password").value}});
    principal=result.principal;await start();
  }catch(error){notice(error.message,true);}
});
$("logout").addEventListener("click",async()=>{
  try{await api("/auth/logout",{method:"POST",body:{}});}catch{}
  principal=null;$("app").hidden=true;$("login").hidden=false;notice("You have signed out.");
});
$("reload").addEventListener("click",async()=>{try{await loadWorkspace();}catch(error){notice(error.message,true);}});
(async()=>{
  try{const session=await api("/auth/session");principal=session.principal;await start();}
  catch{$("login").hidden=false;notice("Local leadership workspace ready. Please sign in.");}
})();
})();