"use strict";
(function(){
const $=id=>document.getElementById(id);
function add(parent,tag,value){const e=document.createElement(tag);e.textContent=String(value??"");parent.append(e);return e;}
function options(select,placeholder,rows){select.replaceChildren();add(select,"option",placeholder).value="";for(const row of rows)add(select,"option",row.label).value=row.id;}
function setup({db,isAdmin}){
 const message=$("nurseryOfficeMessage"),controls=$("nurseryOfficeControls"),cls=$("nurseryOfficeClass"),learner=$("nurseryOfficeLearner"),search=$("nurseryOfficeSearch"),termLabel=$("nurseryOfficeTerm"),rows=$("nurseryOfficeRows"),history=$("nurseryOfficeHistory"),item=$("nurseryOfficeItem"),quantity=$("nurseryOfficeQuantity"),form=$("nurseryOfficeForm"),button=form.querySelector("button");
 let epoch=0,term=null,roster=[],items=[],attempt=null,busy=false;
 function blank(){items=[];rows.replaceChildren();history.replaceChildren();options(item,"Choose material",[]);form.hidden=true;quantity.value="";}
 function clear(){epoch++;for(const input of [cls,learner,search,item,quantity,button])input.disabled=false;controls.hidden=true;blank();roster=[];term=null;attempt=null;search.value="";options(cls,"Choose class",[]);options(learner,"Choose learner",[]);termLabel.textContent="";message.textContent="Office collection unavailable until authorized backend setup.";}
 function current(e){return e===epoch&&isAdmin();}
 function showRoster(){
 const value=search.value.trim().toLowerCase(),previous=learner.value;
 const visible=roster.filter(x=>x.label.toLowerCase().includes(value));
 options(learner,"Choose individual learner",visible);if(visible.some(x=>x.id===previous))learner.value=previous;else blank();
 }
 async function load(){
 if(busy)return;
 if(attempt){message.textContent="An unconfirmed receipt is pending. Retry the same entry before refreshing.";return;}
 clear();if(!isAdmin())return;const e=epoch;message.textContent="Checking office backend…";
 try{
  const [check,c,t]=await Promise.all([db.from("school_nursery_office_deliveries").select("id",{count:"exact",head:true}),db.from("school_classes").select("id,name,stream").in("name",["Baby","Middle","Top"]).order("name"),db.from("academic_terms").select("id,name").eq("is_current",true).eq("is_closed",false)]);
  if(!current(e))return;
  if(check.error||c.error||t.error||t.data?.length!==1)throw Error("Office collection backend unavailable or no single current open term. No records changed.");
  term=t.data[0];options(cls,"Choose Nursery class",(c.data||[]).map(x=>({id:x.id,label:x.name+(x.stream?" · "+x.stream:"")})));termLabel.textContent="Current term: "+term.name;controls.hidden=false;message.textContent="Select a Nursery class and an individual learner.";
 }catch(err){if(current(e))message.textContent=err.message;}
 }
 async function loadRoster(){
 const e=++epoch, classId=cls.value;blank();roster=[];options(learner,"Choose individual learner",[]);search.value="";
 if(!isAdmin()||!classId)return;
 try{
  const r=await db.from("students").select("id,first_name,middle_name,last_name,admission_number").eq("class_id",classId).eq("status","Active").order("first_name").limit(1000);
  if(!current(e))return;if(r.error)throw Error("Learner register unavailable.");
  roster=(r.data||[]).map(x=>({id:x.id,label:[x.first_name,x.middle_name,x.last_name].filter(Boolean).join(" ")+" · "+(x.admission_number||"No pupil code")}));
  showRoster();message.textContent="Choose one learner.";
 }catch(err){if(current(e))message.textContent=err.message;}
 }
 async function loadLearner(){
 const e=++epoch,studentId=learner.value,classId=cls.value;blank();
 if(!isAdmin()||!studentId||!term||!roster.some(x=>x.id===studentId))return;
 try{
  const c=await db.from("school_material_catalogue").select("id,label,quantity,unit").eq("class_id",classId).eq("term_id",term.id).eq("category","scholastic").order("label");
  if(!current(e))return;if(c.error)throw Error("Materials catalogue unavailable.");
  const catalogue=c.data||[];
  if(!catalogue.length){message.textContent="No scholastic requirements assessed for this class/term. Not cleared.";return;}
  const d=await db.from("school_nursery_office_deliveries").select("id,catalogue_id,quantity,received_at").eq("student_id",studentId).in("catalogue_id",catalogue.map(x=>x.id)).order("received_at",{ascending:false}).limit(1000);
  if(!current(e))return;if(d.error||d.data?.length>=1000)throw Error("Delivery history unavailable or requires pagination. No balance displayed.");
  const records=d.data||[];
  items=catalogue.map(x=>{const received=records.filter(y=>y.catalogue_id===x.id).reduce((n,y)=>n+y.quantity,0);return {...x,received,outstanding:Math.max(0,x.quantity-received)};});
  for(const x of items){const tr=add(rows,"tr","");for(const v of [x.label,x.quantity+" "+x.unit,x.received,x.outstanding])add(tr,"td",v);}
  const labels=new Map(items.map(x=>[x.id,x.label]));
  for(const d of records){const tr=add(history,"tr","");for(const v of [labels.get(d.catalogue_id),d.quantity,new Date(d.received_at).toLocaleString("en-GB",{timeZone:"Africa/Kampala"})])add(tr,"td",v);}
  const available=items.filter(x=>x.outstanding>0);options(item,"Choose outstanding material",available.map(x=>({id:x.id,label:x.label+" · "+x.outstanding+" remaining"})));
  form.hidden=!available.length;message.textContent=available.length?"Enter the quantity actually received.":"All assessed items fully received.";
 }catch(err){if(current(e))message.textContent=err.message;}
 }
 item.addEventListener("change",()=>{quantity.value="";quantity.max=items.find(x=>x.id===item.value)?.outstanding||0;});
 cls.addEventListener("change",()=>{if(!busy&&!attempt)void loadRoster();});
 learner.addEventListener("change",()=>{if(!busy&&!attempt)void loadLearner();});
 search.addEventListener("input",()=>{if(!busy&&!attempt){epoch++;showRoster();void loadLearner();}});
 $("nurseryOfficeRefresh").addEventListener("click",()=>{if(!busy)void load();});
 form.addEventListener("submit",async ev=>{
 ev.preventDefault();if(busy||!isAdmin()||form.hidden)return;
 const selected=items.find(x=>x.id===item.value),q=Number(quantity.value),student=learner.value;
 if(!selected||!student||!Number.isSafeInteger(q)||q<1||q>selected.outstanding){message.textContent="Enter a valid outstanding quantity.";return;}
 const key=JSON.stringify([student,selected.id,q]);
 if(attempt&&attempt.key!==key){message.textContent="An earlier receipt has an uncertain outcome. Retry the original entry or have an administrator reconcile it before changing inputs.";return;}
 if(!confirm("Record "+q+" "+selected.unit+" for the selected individual learner?"))return;
 if(!attempt)attempt={key,id:crypto.randomUUID()};
 busy=true;for(const input of [cls,learner,search,item,quantity,button])input.disabled=true;const e=epoch;
 try{
  const result=await db.rpc("record_nursery_office_delivery",{p_request_id:attempt.id,p_catalogue_id:selected.id,p_student_id:student,p_quantity:q});
  if(!current(e))return;
  if(result.error||!result.data)throw Error("Delivery not confirmed. Retry the same entry only after checking receipt history.");
  attempt=null;await loadLearner();
 }catch(err){if(current(e))message.textContent=err.message;}finally{busy=false;for(const input of [cls,learner,search,item,quantity])input.disabled=Boolean(attempt);button.disabled=false;}
 });
 return {load,clear};
}
globalThis.CornhillNurseryOfficeIntake=Object.freeze({setup});
})();
