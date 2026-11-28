(() => {
"use strict";
const $=id=>document.getElementById(id);let principal=null,classes=[];
const csrf=()=>{const p="__Host-cornhill_csrf=";const c=document.cookie.split(";").map(x=>x.trim()).find(x=>x.startsWith(p));return c?decodeURIComponent(c.slice(p.length)):"";};
async function api(path,{method="GET",body}={}){const h={Accept:"application/json"};if(body!==undefined)h["Content-Type"]="application/json";if(method!=="GET")h["X-Cornhill-CSRF"]=csrf();const r=await fetch("/api/v1"+path,{method,headers:h,credentials:"same-origin",cache:"no-store",body:body===undefined?undefined:JSON.stringify(body)});let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.error||"Request failed ("+r.status+")");return d;}
function notice(s,bad=false){$("notice").textContent=s;$("notice").className="notice"+(bad?" error":"");}
function showLearnerRowMessage(message){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=10;td.textContent=message;tr.append(td);$("learner-rows").replaceChildren(tr);}
function can(code){return (principal?.roles||[]).some(r=>(principal.rolePermissions?.[r]||[]).includes(code));}
function showApp(){ $("login").hidden=true;$("app").hidden=false;$("staff-name").textContent=principal.displayName||principal.name||"Staff member";$("staff-roles").textContent=(principal.roles||[]).join(" · ");$("bursar-link").hidden=!["finance.payments_record","finance.expenses_request","finance.expenses_manage","finance.expenses_review","finance.expenses_post","finance.banking_manage","finance.banking_review","finance.banking_verify"].some(can);$("scope-note").textContent=can("learners.read")?"Your records are restricted by your assigned permissions and class assignments.":"Your account has no learner-register viewing permission.";document.querySelector("[data-tab=learners]").hidden=!can("learners.read");document.querySelector("[data-tab=admissions]").hidden=!can("admissions.register_learner");$("admission-form").querySelector("[name=lin]").disabled=!can("learners.lin_manage");document.querySelector("[data-tab=records-centre]").hidden=!(principal?.roles||[]).includes("director")||!can("system.roles_manage");$("admission-form").querySelectorAll("[name=guardianName],[name=relationship],[name=phone],[name=whatsapp],[name=email],[name=smsOptIn],[name=whatsappOptIn]").forEach(n=>n.disabled=!can("learners.guardians_manage")); }
async function loadCatalog(){if(!can("learners.read")&&!can("admissions.register_learner"))return;const d=await api("/school/catalog");classes=d.classes||[];$("class-count").textContent=classes.length;for(const id of ["class-filter","admission-class"]){const sel=$(id);const first=sel.options[0];sel.replaceChildren(first);for(const c of classes){const o=document.createElement("option");o.value=c.id;o.textContent=c.displayName+(c.stream?" · "+c.stream:"");sel.append(o);}}}
async function loadLearners(){if(!can("learners.read")){showLearnerRowMessage("Your role cannot view learner records.");return;}const q=$("search").value.trim(),c=$("class-filter").value;if(q.length===1){notice("Enter at least two characters to search.",true);return;}const p=new URLSearchParams();if(c)p.set("classId",c);if(q)p.set("search",q);try{const d=await api("/school/learners?"+p.toString());const rows=d.learners||[];$("learner-count").textContent=rows.length;$("learner-rows").replaceChildren();for(const l of rows){const tr=document.createElement("tr");for(const v of [l.pupilCode,l.lin||"—",[l.firstName,l.middleName,l.lastName].filter(Boolean).join(" "),l.className||"—",l.p7IndexNumber||"—",l.gender||"—",l.dateOfBirth||"—",l.admissionDate||"—",l.status]){const td=document.createElement("td");td.textContent=v??"—";tr.append(td);}const action=document.createElement("td");if(can("learners.manage")){const edit=document.createElement("button");edit.type="button";edit.className="secondary";edit.textContent="Edit";edit.addEventListener("click",()=>openLearnerEdit(l));action.append(edit);}
if(can("learners.read") && classes.some(item=>item.id===l.classId && item.section==="Nursery")){
  const materialButton=document.createElement("button");
  materialButton.type="button";materialButton.className="secondary";
  materialButton.textContent="Materials";
  materialButton.addEventListener("click",()=>openNurseryMaterials(l));
  action.append(materialButton);
}
if(!action.childNodes.length)action.textContent="—";tr.append(action);$("learner-rows").append(tr);}if(!rows.length)showLearnerRowMessage("No matching learners found.");notice("Learner register refreshed.");}catch(e){notice(e.message,true);}}
// Nursery materials are recorded ONE LEARNER AT A TIME at the office, never as bulk class receipt.
let selectedNurseryLearner=null;
let nurseryPendingReceiptRequest=null;
// Keep an uncertain network receipt's idempotency key when the dialog closes.
// Never create a fresh receipt for that learner until this attempt is confirmed.
const nurseryUnresolvedRequestsByLearner=new Map();
const nurseryLearnerLabel=learner=>[learner.firstName,learner.middleName,learner.lastName].filter(Boolean).join(" ");
function setNurseryStatus(message){$("nursery-materials-message").textContent=message;}
function nurseryDateUganda(){
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Kampala",day:"2-digit",month:"2-digit",year:"numeric"}).formatToParts(new Date());
  const part=type=>parts.find(p=>p.type===type)?.value;
  return part("year")+"-"+part("month")+"-"+part("day");
}
function nurseryLine(tbody,record){
  const tr=document.createElement("tr");
  for(const text of [record.receivedDate,record.materialName,String(record.quantityReceived),record.recordedByStaffId??"—"]){
    const td=document.createElement("td");td.textContent=text??"—";tr.append(td);
  }
  tbody.append(tr);
}
async function loadNurseryHistory(){
  if(!selectedNurseryLearner)return;
  const l=selectedNurseryLearner;
  try{
    const d=await api("/school/learners/"+encodeURIComponent(l.id)+"/nursery-materials");
    if(!selectedNurseryLearner||selectedNurseryLearner.id!==l.id)return;
    const tbody=$("nursery-materials-rows");tbody.replaceChildren();
    const rows=Array.isArray(d.receipts)?d.receipts:[];
    for(const item of rows)nurseryLine(tbody,item);
    if(!rows.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=4;td.textContent="No materials received yet for this learner.";tr.append(td);tbody.append(tr);}
    const totals=$("nursery-materials-totals");totals.replaceChildren();
    for(const item of (d.summary?.materials??[])){
      const li=document.createElement("li");li.textContent=item.materialName+": "+item.quantityReceived;totals.append(li);
    }
    if(!totals.childNodes.length){const li=document.createElement("li");li.textContent="No materials recorded yet.";totals.append(li);}
    const allTimeCount=Number.isSafeInteger(d.summary?.collectionEvents) ? d.summary.collectionEvents : rows.length;
    const notice=d.historyLimited ? "Showing the latest "+rows.length+" of "+allTimeCount+" collection entries. Totals cover all history." : allTimeCount+" collection entries recorded individually for this learner.";
    setNurseryStatus(notice+(nurseryUnresolvedRequestsByLearner.has(l.id) ? " A previous receipt has an uncertain confirmation; please retry the restored entry before starting another." : ""));
  }catch(error){setNurseryStatus(error.message);}
}
function openNurseryMaterials(l){
  selectedNurseryLearner=l;
  nurseryPendingReceiptRequest=nurseryUnresolvedRequestsByLearner.get(l.id)??null;
  const materialForm=$("nursery-materials-form");
  materialForm.reset();
  materialForm.elements.namedItem("receivedDate").value=nurseryDateUganda();
  if(nurseryPendingReceiptRequest){
    // Restore the exact previous attempt's fields; changed details must not
    // accidentally reuse the same request ID or create an extra material receipt.
    const pending=JSON.parse(nurseryPendingReceiptRequest.serialized);
    for(const name of ["materialName","quantityReceived","receivedDate","notes"]){
      const field=materialForm.elements.namedItem(name);
      if(field)field.value=pending[name]??"";
    }
  }
  $("nursery-materials-form").hidden=!can("learners.manage");
  $("nursery-materials-learner").textContent=nurseryLearnerLabel(l)+" · "+l.pupilCode+" · "+(l.className??"Nursery");
  $("nursery-materials-dialog").showModal();
  openNurseryMovementPanel(l);
  setNurseryStatus(nurseryPendingReceiptRequest ?
    "A previous material receipt's confirmation is uncertain. Review and retry the exact same entry." :
    "Loading this learner's received materials…");
  void loadNurseryHistory();
}
$("nursery-materials-refresh").addEventListener("click",()=>{void loadNurseryHistory();});
$("nursery-materials-close").addEventListener("click",()=>{
  $("nursery-materials-dialog").close();
  selectedNurseryLearner=null; nurseryPendingReceiptRequest=null;
  // Do not delete nurseryUnresolvedRequestsByLearner: closing a window is not
  // proof that a POST failed. The original idempotency key stays in memory.
});
$("nursery-materials-dialog").addEventListener("close",()=>{selectedNurseryLearner=null;nurseryPendingReceiptRequest=null;});
$("nursery-materials-print").addEventListener("click",()=>window.print());
$("nursery-materials-form").addEventListener("submit",async event=>{
  event.preventDefault();
  if(!selectedNurseryLearner || !can("learners.manage")) {setNurseryStatus("Only authorised office staff can record received materials.");return;}
  const learner=selectedNurseryLearner;
  const form=event.currentTarget,formData=new FormData(form);
  const data={materialName:String(formData.get("materialName")??"").trim(),
    quantityReceived:Number(formData.get("quantityReceived")),
    receivedDate:String(formData.get("receivedDate")??""),
    notes:String(formData.get("notes")??"").trim()||null};
  // Retain the exact request ID and details across a temporary network failure,
  // so retrying can never silently create a second collection entry.
  const serialized=JSON.stringify(data);
  if(nurseryPendingReceiptRequest && nurseryPendingReceiptRequest.serialized!==serialized){
    setNurseryStatus("The previous receipt's outcome is uncertain. Keep its original details and retry, or refresh the history before starting a new receipt.");
    return;
  }
  if(!nurseryPendingReceiptRequest){
    nurseryPendingReceiptRequest={id:crypto.randomUUID(),serialized};
    nurseryUnresolvedRequestsByLearner.set(learner.id,nurseryPendingReceiptRequest);
  }
  const button=form.querySelector('button[type="submit"]');button.disabled=true;
  setNurseryStatus("Checking and saving this learner's receipt…");
  try{
    const result=await api("/school/learners/"+encodeURIComponent(learner.id)+"/nursery-materials",{
      method:"POST",body:{requestId:nurseryPendingReceiptRequest.id,...data}});
    nurseryUnresolvedRequestsByLearner.delete(learner.id);
    nurseryPendingReceiptRequest=null;form.reset();
    form.elements.namedItem("receivedDate").value=nurseryDateUganda();
    setNurseryStatus(result.alreadyRecorded?"Previous office receipt confirmed.":"Material collection saved for this learner.");
    await loadNurseryHistory();
  }catch(error){setNurseryStatus(error.message+" The same request will be reused if you retry.");}
  finally{button.disabled=false;}
});

/* V49 office accountability: teachers take some/all of EACH learner's items,
 * with dated handover, subsequent use/return, and Director-approved surplus.
 * Ledger server, not the browser, decides stock availability and authorization. */
const nurseryMovementUncertainByLearner=new Map();
const nurseryOfficeStockByName=new Map();
let nurseryMovementPending=null;
const nurseryTeacherNames=new Map();
const nurseryIsDirector=()=> (principal?.roles||[]).includes("director")&&can("system.roles_manage");
function nurseryMovementFields(){
  const f=$("nursery-movement-form"),type=f.elements.namedItem("movementType").value;
  const surplus=type==="director_surplus";
  $("nursery-movement-teacher-wrap").hidden=surplus;
  $("nursery-movement-value-wrap").hidden=!surplus;
  f.elements.namedItem("teacherStaffId").required=!surplus;
  f.elements.namedItem("surplusUnitValueUgx").required=surplus;
  const option=f.querySelector('[value="director_surplus"]');
  option.disabled=!nurseryIsDirector();
  if(option.disabled&&surplus)f.elements.namedItem("movementType").value="teacher_issue";
}
function openNurseryMovementPanel(l){
  const form=$("nursery-movement-form");
  form.hidden=!can("learners.manage");
  form.reset();
  form.elements.namedItem("movementDate").value=nurseryDateUganda();
  nurseryOfficeStockByName.clear();
  nurseryMovementPending=nurseryMovementUncertainByLearner.get(l.id)??null;
  if(nurseryMovementPending){
    const data=JSON.parse(nurseryMovementPending.serialized);
    for(const name of ["movementType","materialName","quantity","movementDate","teacherStaffId","surplusUnitValueUgx","reason"]){
      const field=form.elements.namedItem(name);
      if(field)field.value=data[name]??"";
    }
  }
  nurseryMovementFields();
  void loadNurseryMovementHistory();
  if(can("learners.manage"))void loadNurseryTeachers();
}
async function loadNurseryTeachers(){
  try{
    const d=await api("/school/nursery-material-teachers");
    const selector=$("nursery-movement-form").elements.namedItem("teacherStaffId");
    const existing=selector.value,blank=selector.options[0];
    selector.replaceChildren(blank);nurseryTeacherNames.clear();
    for(const t of (d.teachers??[])){
      nurseryTeacherNames.set(t.id,t.name);
      const option=document.createElement("option");
      option.value=t.id;option.textContent=t.name;selector.append(option);
    }
    selector.value=existing;
  }catch(e){setNurseryStatus("Teacher directory unavailable: "+e.message);}
}
async function loadNurseryMovementHistory(){
  if(!selectedNurseryLearner)return;
  const l=selectedNurseryLearner;
  try{
    const d=await api("/school/learners/"+encodeURIComponent(l.id)+"/nursery-material-movements");
    if(!selectedNurseryLearner||selectedNurseryLearner.id!==l.id)return;
    const rows=$("nursery-material-movements-rows");rows.replaceChildren();
    for(const m of (d.movements??[])){
      const tr=document.createElement("tr");
      const labels={teacher_issue:"Issued to teacher",teacher_return:"Returned to office",
        learner_used:"Used for learner",director_surplus:"Director-approved surplus"};
      for(const value of [m.movementDate,labels[m.movementType]??m.movementType,m.materialName,
        m.quantity,m.teacherStaffId?nurseryTeacherNames.get(m.teacherStaffId)??m.teacherStaffId:"—",
        m.recordedByStaffId??"—",m.reason]){
        const cell=document.createElement("td");cell.textContent=String(value??"—");tr.append(cell);
      }
      rows.append(tr);
    }
    const stock=$("nursery-material-stock");stock.replaceChildren();
    nurseryOfficeStockByName.clear();
    const options=$("nursery-available-materials");options.replaceChildren();
    for(const item of (d.stock??[])){
      nurseryOfficeStockByName.set(item.materialName.trim().toLocaleLowerCase("en"),item.officeRemaining);
      const opt=document.createElement("option");opt.value=item.materialName;options.append(opt);
      const li=document.createElement("li");
      li.textContent=item.materialName+": received "+item.received+", issued "+item.issued+
        ", used "+item.used+", returned "+item.returned+", at office "+item.officeRemaining+
        ", with teachers "+item.teacherOutstanding+", Director-approved surplus "+item.surplus;
      stock.append(li);
    }
    if(d.movementHistoryLimited){const li=document.createElement("li");
      li.textContent="Only recent movements shown; balances include all records.";stock.append(li);}
    if(nurseryMovementUncertainByLearner.has(l.id)){
      setNurseryStatus("An earlier teacher-material movement has uncertain confirmation. Retry the exact restored entry before recording another.");
    }
  }catch(e){setNurseryStatus("Material movement ledger unavailable: "+e.message);}
}
$("nursery-movement-form").elements.namedItem("movementType").addEventListener("change",nurseryMovementFields);
$("nursery-movement-use-all").addEventListener("click",()=>{
  const form=$("nursery-movement-form");
  const type=form.elements.namedItem("movementType").value;
  if(!["teacher_issue","director_surplus"].includes(type)){
    setNurseryStatus("Full office stock can only be issued to a teacher or approved as surplus.");return;
  }
  const item=String(form.elements.namedItem("materialName").value??"").trim().toLocaleLowerCase("en");
  const remaining=nurseryOfficeStockByName.get(item);
  if(!Number.isSafeInteger(remaining)||remaining<1){
    setNurseryStatus("Select a material that is currently available at the office.");return;
  }
  if(remaining>1000){
    setNurseryStatus("Enter separate movements of at most 1,000 items each.");return;
  }
  form.elements.namedItem("quantity").value=String(remaining);
  setNurseryStatus("Filled "+remaining+" items from the currently displayed office balance. Final stock will be rechecked when saved.");
});
$("nursery-movement-form").addEventListener("submit",async event=>{
  event.preventDefault();
  const learner=selectedNurseryLearner,form=event.currentTarget;
  if(!learner||!can("learners.manage")){setNurseryStatus("Office authorization required.");return;}
  const data=new FormData(form);
  const movementType=String(data.get("movementType"));
  if(movementType==="director_surplus"&&!nurseryIsDirector()){
    setNurseryStatus("Only the Director can authorize surplus transfers.");return;
  }
  const body={
    movementType,materialName:String(data.get("materialName")??"").trim(),
    quantity:Number(data.get("quantity")),movementDate:String(data.get("movementDate")??""),
    reason:String(data.get("reason")??"").trim(),
    teacherStaffId:movementType==="director_surplus"?null:String(data.get("teacherStaffId")??"")||null
  };
  if(movementType==="director_surplus"){
    body.surplusUnitValueUgx=Number(data.get("surplusUnitValueUgx"));
  }
  const serialized=JSON.stringify(body);
  if(nurseryMovementPending&&nurseryMovementPending.serialized!==serialized){
    setNurseryStatus("The prior movement's outcome is uncertain. Restore the exact details and retry before changing this learner's material ledger.");
    return;
  }
  if(!nurseryMovementPending){
    nurseryMovementPending={id:crypto.randomUUID(),serialized};
    nurseryMovementUncertainByLearner.set(learner.id,nurseryMovementPending);
  }
  const save=form.querySelector('button[type="submit"]');save.disabled=true;
  try{
    const result=await api("/school/learners/"+encodeURIComponent(learner.id)+"/nursery-material-movements",{
      method:"POST",body:{requestId:nurseryMovementPending.id,...body}});
    nurseryMovementUncertainByLearner.delete(learner.id);nurseryMovementPending=null;
    form.reset();form.elements.namedItem("movementDate").value=nurseryDateUganda();
    nurseryMovementFields();
    await loadNurseryMovementHistory();
    setNurseryStatus(result.alreadyRecorded?
      "Earlier teacher material handover confirmed.":"Material movement recorded against this learner.");
  }catch(e){setNurseryStatus(e.message+" Retry the same movement to avoid double counting.");}
  finally{save.disabled=false;}
});
$("nursery-materials-dialog").addEventListener("close",()=>{nurseryMovementPending=null;});
async function loadNurseryRecordsCentre(){
  if(!nurseryIsDirector())return;
  try{
    const d=await api("/school/nursery-material-records-center");
    const tbody=$("nursery-records-centre-rows");tbody.replaceChildren();
    for(const item of (d.rows??[])){
      const tr=document.createElement("tr");
      for(const x of [item.learnerName+" · "+item.pupilCode,item.className,item.materialName,
        item.received,item.issued,item.used,item.returned,item.officeRemaining,
        item.teacherOutstanding,item.surplus,item.directorTransferValueUgx]){
        const td=document.createElement("td");td.textContent=String(x??"—");tr.append(td);
      }
      tbody.append(tr);
    }
    $("nursery-records-centre-message").textContent=(d.rows??[]).length+
      " learner-material balances. "+(d.limited?"More records exist: report limited to first 1,000; do not treat this as school total.":
      "All listed balances reconcile office stock and teacher custody.")+
      " Director-approved surplus valuation is not posted to finance.";
  }catch(e){$("nursery-records-centre-message").textContent=e.message;}
}
$("nursery-records-centre-refresh").addEventListener("click",()=>{void loadNurseryRecordsCentre();});
$("nursery-records-centre-print").addEventListener("click",()=>window.print());
function openLearnerEdit(l){const form=$("learner-edit-form");const values={learnerId:l.id,firstName:l.firstName||"",middleName:l.middleName||"",lastName:l.lastName||"",gender:l.gender||"Female",dateOfBirth:l.dateOfBirth||"",learnerType:l.learnerType||"Day",previousSchool:l.previousSchool||"",lin:l.lin||"",p7IndexNumber:l.p7IndexNumber||"",reason:""};for(const [key,value] of Object.entries(values)){const field=form.elements.namedItem(key);if(field)field.value=value;}form.elements.namedItem("lin").disabled=!can("learners.lin_manage");$("learner-edit-message").textContent="Pupil code, class, admission identity and financial records cannot be changed here.";$("learner-edit-dialog").showModal();}
$("cancel-learner-edit").addEventListener("click",()=>$("learner-edit-dialog").close());
$("learner-edit-form").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget),id=f.get("learnerId");const body={firstName:f.get("firstName"),middleName:f.get("middleName")||null,lastName:f.get("lastName"),gender:f.get("gender"),dateOfBirth:f.get("dateOfBirth")||null,learnerType:f.get("learnerType"),previousSchool:f.get("previousSchool")||null,p7IndexNumber:f.get("p7IndexNumber")||null,reason:f.get("reason")};if(can("learners.lin_manage"))body.lin=f.get("lin")||null;try{await api("/school/learners/"+encodeURIComponent(id)+"/profile",{method:"PATCH",body});$("learner-edit-dialog").close();notice("Learner profile updated and audit record saved.");await loadLearners();}catch(err){$("learner-edit-message").textContent=err.message;notice(err.message,true);}});
function activate(tab){document.querySelectorAll(".tabs button").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));document.querySelectorAll(".view").forEach(v=>v.hidden=v.id!==tab);if(tab==="learners")loadLearners();if(tab==="records-centre")void loadNurseryRecordsCentre();}
$("login-form").addEventListener("submit",async e=>{e.preventDefault();try{const d=await api("/auth/staff/login",{method:"POST",body:{username:$("username").value,password:$("password").value}});principal=d.principal;showApp();await loadCatalog();notice("Signed in securely.");}catch(x){notice(x.message,true);}});
$("logout").addEventListener("click",async()=>{try{await api("/auth/logout",{method:"POST",body:{}});}catch{}principal=null;nurseryMovementUncertainByLearner.clear();nurseryUnresolvedRequestsByLearner.clear();nurseryTeacherNames.clear();$("app").hidden=true;$("login").hidden=false;notice("You have signed out.");});
document.querySelectorAll(".tabs button").forEach(b=>b.addEventListener("click",()=>activate(b.dataset.tab)));
$("refresh").addEventListener("click",loadLearners);$("search-button").addEventListener("click",loadLearners);$("search").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();loadLearners();}});
$("bursary").addEventListener("change",e=>$("bursary-amount-wrap").hidden=!e.target.checked);
$("admission-form").addEventListener("submit",async e=>{e.preventDefault();if(!can("admissions.register_learner")){notice("Your role cannot register learners.",true);return;}const f=new FormData(e.currentTarget),gName=f.get("guardianName")?.trim();const body={firstName:f.get("firstName"),middleName:f.get("middleName")||null,lastName:f.get("lastName"),gender:f.get("gender"),dateOfBirth:f.get("dateOfBirth")||null,admissionDate:f.get("admissionDate"),classId:f.get("classId"),lin:f.get("lin")||null,learnerType:f.get("learnerType"),previousSchool:f.get("previousSchool")||null,p7IndexNumber:f.get("p7IndexNumber")||null,isBursary:f.get("isBursary")==="on",bursaryFeeUgx:Number(f.get("bursaryFeeUgx")||0),bursaryCategory:f.get("bursaryCategory")||null,bursaryReason:f.get("bursaryReason")||null,takesBreakfast:f.get("takesBreakfast")==="on",takesLunch:f.get("takesLunch")==="on",reason:f.get("reason")||null};if(gName||f.get("phone")||f.get("whatsapp")||f.get("email")||f.get("smsOptIn")==="on"||f.get("whatsappOptIn")==="on"){if(!gName){$("admission-message").textContent="Enter the guardian name when adding guardian details.";return;}body.guardian={name:gName,relationship:f.get("relationship")||null,phone:f.get("phone")||null,whatsapp:f.get("whatsapp")||null,email:f.get("email")||null,smsOptIn:f.get("smsOptIn")==="on",whatsappOptIn:f.get("whatsappOptIn")==="on"};}try{const d=await api("/school/admissions",{method:"POST",body});$("admission-message").textContent="Admission saved. Permanent pupil code: "+d.learner.pupilCode;e.currentTarget.reset();$("bursary-amount-wrap").hidden=true;notice("Learner registered successfully.");}catch(x){$("admission-message").textContent=x.message;notice(x.message,true);}});
(async()=>{try{const h=await fetch("/api/v1/health",{cache:"no-store"});if(!h.ok)throw Error();const d=await api("/auth/session");principal=d.principal;showApp();await loadCatalog();notice("Local school service connected. Signed-in session restored.");}catch{$("login").hidden=false;notice("Local school service ready. Please sign in.");}})();
})();