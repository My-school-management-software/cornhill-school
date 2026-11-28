(() => {
"use strict";
const $=id=>document.getElementById(id);let principal=null,classes=[];
const csrf=()=>{const p="__Host-cornhill_csrf=";const c=document.cookie.split(";").map(x=>x.trim()).find(x=>x.startsWith(p));return c?decodeURIComponent(c.slice(p.length)):"";};
async function api(path,{method="GET",body}={}){const h={Accept:"application/json"};if(body!==undefined)h["Content-Type"]="application/json";if(method!=="GET")h["X-Cornhill-CSRF"]=csrf();const r=await fetch("/api/v1"+path,{method,headers:h,credentials:"same-origin",cache:"no-store",body:body===undefined?undefined:JSON.stringify(body)});let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.error||"Request failed ("+r.status+")");return d;}
function notice(s,bad=false){$("notice").textContent=s;$("notice").className="notice"+(bad?" error":"");}
function showLearnerRowMessage(message){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=10;td.textContent=message;tr.append(td);$("learner-rows").replaceChildren(tr);}
function can(code){return (principal?.roles||[]).some(r=>(principal.rolePermissions?.[r]||[]).includes(code));}
function showApp(){ $("login").hidden=true;$("app").hidden=false;$("staff-name").textContent=principal.displayName||principal.name||"Staff member";$("staff-roles").textContent=(principal.roles||[]).join(" · ");$("bursar-link").hidden=!["finance.payments_record","finance.expenses_request","finance.expenses_manage","finance.expenses_review","finance.expenses_post","finance.banking_manage","finance.banking_review","finance.banking_verify"].some(can);$("scope-note").textContent=can("learners.read")?"Your records are restricted by your assigned permissions and class assignments.":"Your account has no learner-register viewing permission.";document.querySelector("[data-tab=learners]").hidden=!can("learners.read");document.querySelector("[data-tab=admissions]").hidden=!can("admissions.register_learner");$("admission-form").querySelector("[name=lin]").disabled=!can("learners.lin_manage");$("admission-form").querySelectorAll("[name=guardianName],[name=relationship],[name=phone],[name=whatsapp],[name=email],[name=smsOptIn],[name=whatsappOptIn]").forEach(n=>n.disabled=!can("learners.guardians_manage")); }
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
    setNurseryStatus(d.historyLimited ? "Showing the latest "+rows.length+" of "+allTimeCount+" collection entries. Totals cover all history." : allTimeCount+" collection entries recorded individually for this learner.");
  }catch(error){setNurseryStatus(error.message);}
}
function openNurseryMaterials(l){
  selectedNurseryLearner=l; nurseryPendingReceiptRequest=null;
  $("nursery-materials-form").reset();
  $("nursery-materials-form").elements.namedItem("receivedDate").value=nurseryDateUganda();
  $("nursery-materials-form").hidden=!can("learners.manage");
  $("nursery-materials-learner").textContent=nurseryLearnerLabel(l)+" · "+l.pupilCode+" · "+(l.className??"Nursery");
  $("nursery-materials-dialog").showModal();
  setNurseryStatus("Loading this learner's received materials…");
  void loadNurseryHistory();
}
$("nursery-materials-refresh").addEventListener("click",()=>{void loadNurseryHistory();});
$("nursery-materials-close").addEventListener("click",()=>{
  $("nursery-materials-dialog").close();
  selectedNurseryLearner=null; nurseryPendingReceiptRequest=null;
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
  if(!nurseryPendingReceiptRequest)nurseryPendingReceiptRequest={id:crypto.randomUUID(),serialized};
  const button=form.querySelector('button[type="submit"]');button.disabled=true;
  setNurseryStatus("Checking and saving this learner's receipt…");
  try{
    const result=await api("/school/learners/"+encodeURIComponent(learner.id)+"/nursery-materials",{
      method:"POST",body:{requestId:nurseryPendingReceiptRequest.id,...data}});
    nurseryPendingReceiptRequest=null;form.reset();
    form.elements.namedItem("receivedDate").value=nurseryDateUganda();
    setNurseryStatus(result.alreadyRecorded?"Previous office receipt confirmed.":"Material collection saved for this learner.");
    await loadNurseryHistory();
  }catch(error){setNurseryStatus(error.message+" The same request will be reused if you retry.");}
  finally{button.disabled=false;}
});
function openLearnerEdit(l){const form=$("learner-edit-form");const values={learnerId:l.id,firstName:l.firstName||"",middleName:l.middleName||"",lastName:l.lastName||"",gender:l.gender||"Female",dateOfBirth:l.dateOfBirth||"",learnerType:l.learnerType||"Day",previousSchool:l.previousSchool||"",lin:l.lin||"",p7IndexNumber:l.p7IndexNumber||"",reason:""};for(const [key,value] of Object.entries(values)){const field=form.elements.namedItem(key);if(field)field.value=value;}form.elements.namedItem("lin").disabled=!can("learners.lin_manage");$("learner-edit-message").textContent="Pupil code, class, admission identity and financial records cannot be changed here.";$("learner-edit-dialog").showModal();}
$("cancel-learner-edit").addEventListener("click",()=>$("learner-edit-dialog").close());
$("learner-edit-form").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget),id=f.get("learnerId");const body={firstName:f.get("firstName"),middleName:f.get("middleName")||null,lastName:f.get("lastName"),gender:f.get("gender"),dateOfBirth:f.get("dateOfBirth")||null,learnerType:f.get("learnerType"),previousSchool:f.get("previousSchool")||null,p7IndexNumber:f.get("p7IndexNumber")||null,reason:f.get("reason")};if(can("learners.lin_manage"))body.lin=f.get("lin")||null;try{await api("/school/learners/"+encodeURIComponent(id)+"/profile",{method:"PATCH",body});$("learner-edit-dialog").close();notice("Learner profile updated and audit record saved.");await loadLearners();}catch(err){$("learner-edit-message").textContent=err.message;notice(err.message,true);}});
function activate(tab){document.querySelectorAll(".tabs button").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));document.querySelectorAll(".view").forEach(v=>v.hidden=v.id!==tab);if(tab==="learners")loadLearners();}
$("login-form").addEventListener("submit",async e=>{e.preventDefault();try{const d=await api("/auth/staff/login",{method:"POST",body:{username:$("username").value,password:$("password").value}});principal=d.principal;showApp();await loadCatalog();notice("Signed in securely.");}catch(x){notice(x.message,true);}});
$("logout").addEventListener("click",async()=>{try{await api("/auth/logout",{method:"POST",body:{}});}catch{}principal=null;$("app").hidden=true;$("login").hidden=false;notice("You have signed out.");});
document.querySelectorAll(".tabs button").forEach(b=>b.addEventListener("click",()=>activate(b.dataset.tab)));
$("refresh").addEventListener("click",loadLearners);$("search-button").addEventListener("click",loadLearners);$("search").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();loadLearners();}});
$("bursary").addEventListener("change",e=>$("bursary-amount-wrap").hidden=!e.target.checked);
$("admission-form").addEventListener("submit",async e=>{e.preventDefault();if(!can("admissions.register_learner")){notice("Your role cannot register learners.",true);return;}const f=new FormData(e.currentTarget),gName=f.get("guardianName")?.trim();const body={firstName:f.get("firstName"),middleName:f.get("middleName")||null,lastName:f.get("lastName"),gender:f.get("gender"),dateOfBirth:f.get("dateOfBirth")||null,admissionDate:f.get("admissionDate"),classId:f.get("classId"),lin:f.get("lin")||null,learnerType:f.get("learnerType"),previousSchool:f.get("previousSchool")||null,p7IndexNumber:f.get("p7IndexNumber")||null,isBursary:f.get("isBursary")==="on",bursaryFeeUgx:Number(f.get("bursaryFeeUgx")||0),bursaryCategory:f.get("bursaryCategory")||null,bursaryReason:f.get("bursaryReason")||null,takesBreakfast:f.get("takesBreakfast")==="on",takesLunch:f.get("takesLunch")==="on",reason:f.get("reason")||null};if(gName||f.get("phone")||f.get("whatsapp")||f.get("email")||f.get("smsOptIn")==="on"||f.get("whatsappOptIn")==="on"){if(!gName){$("admission-message").textContent="Enter the guardian name when adding guardian details.";return;}body.guardian={name:gName,relationship:f.get("relationship")||null,phone:f.get("phone")||null,whatsapp:f.get("whatsapp")||null,email:f.get("email")||null,smsOptIn:f.get("smsOptIn")==="on",whatsappOptIn:f.get("whatsappOptIn")==="on"};}try{const d=await api("/school/admissions",{method:"POST",body});$("admission-message").textContent="Admission saved. Permanent pupil code: "+d.learner.pupilCode;e.currentTarget.reset();$("bursary-amount-wrap").hidden=true;notice("Learner registered successfully.");}catch(x){$("admission-message").textContent=x.message;notice(x.message,true);}});
(async()=>{try{const h=await fetch("/api/v1/health",{cache:"no-store"});if(!h.ok)throw Error();const d=await api("/auth/session");principal=d.principal;showApp();await loadCatalog();notice("Local school service connected. Signed-in session restored.");}catch{$("login").hidden=false;notice("Local school service ready. Please sign in.");}})();
})();