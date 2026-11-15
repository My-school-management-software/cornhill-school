(() => {
"use strict";
const $ = id => document.getElementById(id);
let principal = null;
let workspace = null;
let administration = null;
let guardianContacts = [];
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
function renderGuardianContacts() {
  const host = $("guardian-contact-rows");
  host.replaceChildren();
  if (!guardianContacts.length) {
    const row = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.textContent = "No active guardian contacts with registered phone numbers were found.";
    row.append(td);
    host.append(row);
    return;
  }
  for (const contact of guardianContacts) {
    const row = document.createElement("tr");
    cell(row, contact.learnerName);
    cell(row, contact.pupilCode);
    cell(row, contact.guardianName);
    cell(row, contact.phoneLastFour ? "Ending " + contact.phoneLastFour : "Not recorded");
    cell(row, contact.accountExists ? contact.accountStatus : "No account");
    cell(row, contact.accessStatus === "approved" ? "Approved" : contact.accessStatus === "revoked" ? "Revoked" : "Not linked");
    const actionCell = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.guardianIssue = contact.contactId;
    const blocked = contact.accountExists && ["suspended", "disabled"].includes(contact.accountStatus);
    button.disabled = blocked;
    button.className = blocked ? "secondary" : "small-action";
    if (blocked) button.textContent = "Account blocked";
    else if (contact.accountExists && contact.accountStatus === "active" && contact.accessStatus === "approved") button.textContent = "Replace PIN";
    else if (contact.accountExists && contact.accountStatus === "active") button.textContent = "Approve access";
    else button.textContent = "Issue PIN & approve";
    actionCell.append(button);
    row.append(actionCell);
    host.append(row);
  }
}

async function loadGuardianContacts() {
  const result = await api("/guardian/access/contacts");
  guardianContacts = Array.isArray(result.contacts) ? result.contacts : [];
  renderGuardianContacts();
}

async function issueOrApproveGuardian(contactId) {
  const contact = guardianContacts.find(item => item.contactId === contactId);
  if (!contact) return;
  const replaceExisting = contact.accountExists &&
    contact.accountStatus === "active" && contact.accessStatus === "approved";
  if (replaceExisting && !window.confirm(
    "Replace the existing PIN for " + contact.guardianName +
    "? The previous PIN will stop working for all learners linked to this guardian account."
  )) return;
  const button = [...document.querySelectorAll("[data-guardian-issue]")].find(item => item.dataset.guardianIssue === contactId);
  if (button) button.disabled = true;
  try {
    const result = await api("/guardian/access/issue-pin", {
      method: "POST",
      body: { contactId, replaceExisting }
    });
    if (result.pin) {
      $("guardian-pin").textContent = result.pin;
      $("guardian-credential").hidden = false;
      notice(
        "Guardian access approved for " + (result.learner?.pupilCode || contact.pupilCode) +
        ". The one-time PIN is displayed below."
      );
    } else {
      $("guardian-credential").hidden = true;
      $("guardian-pin").textContent = "";
      notice("Guardian access approved for " + (result.learner?.pupilCode || contact.pupilCode) +
        ". The existing guardian PIN was not changed.");
    }
    await loadGuardianContacts();
  } catch (error) {
    notice(error.message || "Guardian access could not be updated.", true);
    if (button) button.disabled = false;
  }
}

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
function renderPermissionEditor() {
  const roleCode=$("permission-role").value;
  const host=$("permission-list");host.replaceChildren();
  if(!roleCode||!administration){empty(host,"Choose a staff role to view its permissions.");return;}
  const existing=new Set(administration.grants.filter(grant=>grant.roleCode===roleCode).map(grant=>grant.permissionCode));
  const groups=new Map();
  for(const item of administration.permissions){
    if(item.permissionCode==="system.roles_manage"||item.permissionCode==="system.backups_manage")continue;
    if(!groups.has(item.category))groups.set(item.category,[]);
    groups.get(item.category).push(item);
  }
  for(const [category,items] of groups){
    const section=document.createElement("section");section.className="permission-group";
    const heading=document.createElement("h4");heading.textContent=category.replaceAll("_"," ").toUpperCase();section.append(heading);
    for(const item of items){
      const label=document.createElement("label");label.className="permission-choice";
      const input=document.createElement("input");input.type="checkbox";input.value=item.permissionCode;input.checked=existing.has(item.permissionCode);
      const detail=document.createElement("span");
      const name=document.createElement("strong");name.textContent=item.permissionCode;detail.append(name);
      const description=document.createElement("small");description.textContent=item.description+(item.highRisk?" · HIGH RISK":"");detail.append(description);
      label.append(input,detail);section.append(label);
    }
    host.append(section);
  }
}
function renderAdminWorkspace(){
  if(!administration)return;
  const roleSelect=$("permission-role"),newRole=$("new-staff-role"),previousRole=roleSelect.value;
  roleSelect.replaceChildren();newRole.replaceChildren();
  for(const select of [roleSelect,newRole]){
    const first=document.createElement("option");first.value="";first.textContent="Choose staff role";select.append(first);
  }
  for(const role of administration.roles){
    for(const select of [roleSelect,newRole]){
      const option=document.createElement("option");option.value=role.roleCode;option.textContent=role.displayName;select.append(option);
    }
  }
  if(administration.roles.some(role=>role.roleCode===previousRole))roleSelect.value=previousRole;
  else if(administration.roles.length)roleSelect.value=administration.roles[0].roleCode;
  const host=$("account-rows");host.replaceChildren();
  if(!administration.staff.length)empty(host,"No staff login accounts have been created yet.");
  else for(const account of administration.staff){
    const row=document.createElement("tr");
    for(const value of [account.staffNumber,account.legalName,account.username,account.jobTitle,(account.roles||[]).join(", "),account.accountStatus,account.employmentStatus]){
      const td=document.createElement("td");td.textContent=value||"—";row.append(td);
    }
    host.append(row);
  }
  renderPermissionEditor();
}
async function loadAdministrationWorkspace(){
  administration=await api("/security/role-management");
  renderAdminWorkspace();
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
  const guardianManager = can("guardians.access_approve");
  $("guardian-access-panel").hidden = !guardianManager;
  if (guardianManager) await loadGuardianContacts();
  const directorManager=principal.roles?.includes("director")&&can("system.roles_manage");
  $("admin-panel").hidden=!directorManager;
  if(directorManager)await loadAdministrationWorkspace();
  notice("Leadership workspace loaded. Only records permitted by your assigned staff permissions are displayed.");
}
async function start(){
  $("login").hidden=true;$("app").hidden=false;
  $("staff-name").textContent=principal.displayName||"Staff member";
  $("staff-roles").textContent=(principal.roles||[]).join(" · ");
  $("bursar-link").hidden=!["finance.payments_record","finance.expenses_request","finance.expenses_manage","finance.expenses_review","finance.expenses_post","finance.banking_manage","finance.banking_review","finance.banking_verify"].some(can);
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
$("permission-role").addEventListener("change",renderPermissionEditor);
$("guardian-refresh").addEventListener("click", async () => {
  try { await loadGuardianContacts(); notice("Guardian contacts refreshed."); }
  catch (error) { notice(error.message, true); }
});
$("guardian-contact-rows").addEventListener("click", async event => {
  const button = event.target.closest("[data-guardian-issue]");
  if (button && !button.disabled) await issueOrApproveGuardian(button.dataset.guardianIssue);
});
$("dismiss-guardian-pin").addEventListener("click", () => {
  $("guardian-pin").textContent = "";
  $("guardian-credential").hidden = true;
});
$("copy-guardian-pin").addEventListener("click", async () => {
  const value = $("guardian-pin").textContent;
  if (!value) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable in this browser.");
    await navigator.clipboard.writeText(value);
    notice("PIN copied. Share it privately with the guardian.");
  } catch (error) { notice(error.message, true); }
});
$("save-role-permissions").addEventListener("click",async()=>{
  const roleCode=$("permission-role").value;
  if(!roleCode){notice("Choose a staff role first.",true);return;}
  const permissionCodes=[...$("permission-list").querySelectorAll('input[type="checkbox"]:checked')].map(input=>input.value);
  try{
    await api("/security/roles/"+encodeURIComponent(roleCode)+"/permissions",{method:"POST",body:{permissionCodes}});
    await loadAdministrationWorkspace();
    notice("Role permissions saved and audited for "+roleCode+".");
  }catch(error){notice(error.message,true);}
});
$("staff-account-form").addEventListener("submit",async event=>{
  event.preventDefault();
  const form=new FormData(event.currentTarget),body=Object.fromEntries(form.entries());
  try{
    const result=await api("/security/staff-accounts",{method:"POST",body});
    event.currentTarget.reset();
    await loadAdministrationWorkspace();
    notice("Staff account created: "+result.staff.username+" ("+result.staff.roleCode+"). Give the initial password to the staff member privately.");
  }catch(error){notice(error.message,true);}
});
(async()=>{
  try{const session=await api("/auth/session");principal=session.principal;await start();}
  catch{$("login").hidden=false;notice("Local leadership workspace ready. Please sign in.");}
})();
})();