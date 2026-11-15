(() => {
"use strict";
const $=id=>document.getElementById(id);
let principal=null,devices=[],staff=[];
const csrf=()=>{const prefix="__Host-cornhill_csrf=";const value=document.cookie.split(";").map(v=>v.trim()).find(v=>v.startsWith(prefix));return value?decodeURIComponent(value.slice(prefix.length)):"";};
async function api(path,{method="GET",body}={}){
  const headers={Accept:"application/json"};
  if(body!==undefined)headers["Content-Type"]="application/json";
  if(method!=="GET")headers["X-Cornhill-CSRF"]=csrf();
  const response=await fetch("/api/v1"+path,{method,headers,credentials:"same-origin",cache:"no-store",body:body===undefined?undefined:JSON.stringify(body)});
  let data={};try{data=await response.json();}catch{}
  if(!response.ok)throw new Error(data.error||"Attendance request failed ("+response.status+").");
  return data;
}
function notice(message,bad=false){$("notice").textContent=message;$("notice").className="notice"+(bad?" error":"");}
function cell(row,value){const td=document.createElement("td");td.textContent=value==null||value===""?"—":String(value);row.append(td);return td;}
function empty(body,columns,message){body.replaceChildren();const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=columns;td.className="empty";td.textContent=message;tr.append(td);body.append(tr);}
function dateTime(value){if(!value)return "—";const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString();}
function makeOption(select,value,label){const option=document.createElement("option");option.value=value;option.textContent=label;select.append(option);}
function setOptions(select,items,placeholder,label){
  const selected=select.value;select.replaceChildren();makeOption(select,"",placeholder);
  for(const item of items)makeOption(select,item.id,label(item));
  if(items.some(item=>item.id===selected))select.value=selected;
}
function renderDevices(){
  const body=$("device-rows");body.replaceChildren();
  if(!devices.length)empty(body,7,"No attendance devices have been registered.");
  else for(const d of devices){
    const tr=document.createElement("tr");
    cell(tr,d.deviceCode);cell(tr,d.deviceName);cell(tr,d.connectionType);
    cell(tr,[d.model,d.serialNumber].filter(Boolean).join(" / "));
    cell(tr,d.status);cell(tr,dateTime(d.lastImportAt));
    const td=cell(tr,"");
    const actions=document.createElement("div");actions.className="actions-cell";
    for(const status of ["Active","Maintenance","Retired"]){
      if(status===d.status)continue;
      const button=document.createElement("button");button.type="button";button.className="status-button";button.textContent=status;
      button.addEventListener("click",()=>changeDeviceStatus(d.id,status));actions.append(button);
    }
    td.append(actions);body.append(tr);
  }
  const deviceLabel=d=>d.deviceCode+" — "+d.deviceName+" ("+d.status+")";
  setOptions($("mapping-device"),devices,"Choose device",deviceLabel);
  setOptions($("import-device"),devices.filter(d=>d.status==="Active"),"Choose active device",deviceLabel);
}
function renderStaff(){
  setOptions($("mapping-staff"),staff,"Choose active staff member",s=>s.staffNumber+" — "+s.staffName+" · "+s.jobTitle);
}
function renderMappings(items){
  const body=$("mapping-rows");body.replaceChildren();
  if(!items.length){empty(body,6,"No staff identifiers are mapped to the selected device.");return;}
  for(const m of items){
    const tr=document.createElement("tr");
    cell(tr,m.deviceStaffIdentifier);cell(tr,m.staffNumber+" — "+m.staffName);
    cell(tr,m.effectiveFrom);cell(tr,m.effectiveTo);cell(tr,m.active?"Active":"Closed");
    const td=cell(tr,"");
    if(m.active){
      const button=document.createElement("button");button.type="button";button.className="status-button";button.textContent="Close mapping";
      button.addEventListener("click",()=>closeMapping(m.id));td.append(button);
    }
    body.append(tr);
  }
}
function renderImports(items){
  const body=$("import-rows");body.replaceChildren();
  if(!items.length){empty(body,8,"No attendance import batches have been recorded.");return;}
  for(const b of items){
    const tr=document.createElement("tr");
    cell(tr,dateTime(b.startedAt));cell(tr,b.deviceCode+" — "+b.deviceName);cell(tr,b.sourceName);
    cell(tr,b.rowsReceived);cell(tr,b.rowsAccepted);cell(tr,b.rowsRejected);cell(tr,b.status);
    const td=cell(tr,"");
    if(Number(b.rowsRejected)>0){
      const button=document.createElement("button");button.type="button";button.className="status-button";button.textContent="View rejections";
      button.addEventListener("click",()=>showRejections(b.id,b.sourceName));td.append(button);
    }else td.textContent="—";
    body.append(tr);
  }
}
async function loadMappings(){
  const id=$("mapping-device").value;
  if(!id){renderMappings([]);return;}
  const result=await api("/staff/attendance/devices/"+encodeURIComponent(id)+"/mappings");
  renderMappings(result.mappings||[]);
}
async function loadWorkspace(){
  const [deviceResult,staffResult,importResult]=await Promise.all([
    api("/staff/attendance/devices"),api("/staff/attendance/staff-options"),api("/staff/attendance/imports")
  ]);
  devices=deviceResult.devices||[];staff=staffResult.staff||[];
  renderDevices();renderStaff();renderImports(importResult.imports||[]);
  await loadMappings();
  notice("Attendance devices, staff mappings and import history refreshed. Only authorised staff can manage these records.");
}
async function changeDeviceStatus(deviceId,status){
  try{await api("/staff/attendance/devices/"+encodeURIComponent(deviceId)+"/status",{method:"POST",body:{status}});await loadWorkspace();notice("Device status updated to "+status+".");}
  catch(error){notice(error.message,true);}
}
async function closeMapping(mappingId){
  const effectiveTo=prompt("Enter the last date this mapping is valid (YYYY-MM-DD). The mapping history will be retained.");
  if(!effectiveTo)return;
  try{await api("/staff/attendance/mappings/"+encodeURIComponent(mappingId)+"/close",{method:"POST",body:{effectiveTo}});await loadMappings();notice("The device staff mapping has been closed without deleting its history.");}
  catch(error){notice(error.message,true);}
}
async function showRejections(batchId,sourceName){
  try{
    const result=await api("/staff/attendance/imports/"+encodeURIComponent(batchId)+"/rejections");
    const box=$("rejection-result");box.replaceChildren();box.hidden=false;
    const heading=document.createElement("h3");heading.textContent="Rejected rows — "+sourceName;box.append(heading);
    const list=document.createElement("ol");
    for(const item of result.rejections||[]){
      const li=document.createElement("li");li.textContent="Row "+item.rowNumber+" · "+item.reasonCode+" · "+item.reason;list.append(li);
    }
    if(!list.children.length){const p=document.createElement("p");p.textContent="No rejection details are available.";box.append(p);}else box.append(list);
  }catch(error){notice(error.message,true);}
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
  principal=null;$("app").hidden=true;$("login").hidden=false;notice("You have signed out.");
});
$("device-form").addEventListener("submit",async event=>{
  event.preventDefault();
  const data=Object.fromEntries(new FormData(event.currentTarget));
  for(const key of ["manufacturer","model","serialNumber","deviceLocation"])data[key]=data[key]||null;
  try{const result=await api("/staff/attendance/devices",{method:"POST",body:data});event.currentTarget.reset();await loadWorkspace();notice("Registered device "+result.device.deviceCode+". It remains Planned until activated.");}
  catch(error){notice(error.message,true);}
});
$("mapping-device").addEventListener("change",()=>{void loadMappings().catch(error=>notice(error.message,true));});
$("mapping-form").addEventListener("submit",async event=>{
  event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));
  const deviceId=data.deviceId;delete data.deviceId;
  try{await api("/staff/attendance/devices/"+encodeURIComponent(deviceId)+"/mappings",{method:"POST",body:data});event.currentTarget.reset();await loadMappings();notice("Staff identifier mapping saved with its effective date.");}
  catch(error){notice(error.message,true);}
});
$("import-form").addEventListener("submit",async event=>{
  event.preventDefault();
  const file=$("csv-file").files?.[0];
  if(!file){notice("Choose a CSV file to import.",true);return;}
  if(file.size>2*1024*1024){notice("Attendance CSV files must be 2 MB or smaller.",true);return;}
  const form=new FormData(event.currentTarget),deviceId=form.get("deviceId");
  const body={
    sourceName:file.name,csvText:await file.text(),
    columns:{
      staffIdentifier:form.get("staffIdentifier"),occurredAt:form.get("occurredAt"),
      eventType:form.get("eventType")||null,externalEventId:form.get("externalEventId")||null
    }
  };
  const button=$("import-submit");button.disabled=true;$("import-message").textContent="Validating and importing attendance events…";
  try{
    const result=await api("/staff/attendance/devices/"+encodeURIComponent(deviceId)+"/imports",{method:"POST",body});
    const batch=result.batch;
    const box=$("import-result");box.hidden=false;box.className="result"+(batch.rowsRejected?" warning":"");box.replaceChildren();
    const strong=document.createElement("strong");strong.textContent="Import completed";box.append(strong);
    const p=document.createElement("p");p.textContent=Number(batch.rowsAccepted)+" event(s) accepted; "+Number(batch.rowsRejected)+" rejected from "+Number(batch.rowsReceived)+" source row(s).";box.append(p);
    const note=document.createElement("p");note.textContent="Accepted events remain Pending review. They do not change attendance-day or payroll records.";box.append(note);
    if(result.rejections?.length){
      const list=document.createElement("ul");
      for(const item of result.rejections){const li=document.createElement("li");li.textContent="Row "+item.rowNumber+": "+item.reason;list.append(li);}
      box.append(list);
    }
    event.currentTarget.reset();await loadWorkspace();notice("Attendance CSV import completed and its source checksum was recorded.");
  }catch(error){$("import-message").textContent=error.message;notice(error.message,true);}
  finally{button.disabled=false;}
});
(async()=>{
  try{
    const session=await api("/auth/session");principal=session.principal;showApp();
    try{await loadWorkspace();}catch(error){notice(error.message,true);}
  }catch{
    $("app").hidden=true;$("login").hidden=false;
    notice("Local Attendance service connected. Sign in with an authorised staff account.");
  }
})();
})();