"use strict";
(function(){
 const text=(el,value)=>{el.textContent=String(value??"")};
 const add=(el,tag,value)=>{const n=document.createElement(tag);text(n,value);el.append(n);return n;};
 const $=id=>document.getElementById(id);
 const fmtDate=value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split("-").reverse().join("/"):value;
 function endAnnual(start){const d=new Date(start+"T00:00:00Z");if(!Number.isFinite(d.getTime()))throw Error("Invalid term");const day=d.getUTCDate(),month=d.getUTCMonth();d.setUTCFullYear(d.getUTCFullYear()+1,month,1);const last=new Date(Date.UTC(d.getUTCFullYear(),month+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last)-1);return d.toISOString().slice(0,10);}
 function setup({db,isAdmin}){
   let terms=[],classes=[],epoch=0;
   const panel=$("materialCataloguePanel"),form=$("materialCatalogueForm"),msg=$("materialCatalogueMsg"),table=$("materialCatalogueRows"),term=$("materialCatalogueTerm"),classBox=$("materialCatalogueClasses"),duration=$("materialCatalogueDuration"),custom=$("materialCatalogueCustom");
   if(!panel||!form)return {load:async()=>{},clear:()=>{}};
   const clear=()=>{epoch++;terms=[];classes=[];term.replaceChildren();classBox.replaceChildren();table.replaceChildren();form.reset();form.hidden=true;msg.textContent="Sign in as an administrator to load catalogue.";};
   function populate(){
      term.replaceChildren();for(const t of terms){const opt=add(term,"option",t.name+" · "+fmtDate(t.starts_on));opt.value=t.id;}
      classBox.replaceChildren();for(const c of classes){const label=document.createElement("label"),cb=document.createElement("input");cb.type="checkbox";cb.value=c.id;cb.name="materialClass";label.append(cb,document.createTextNode(" "+c.name+(c.stream?" · "+c.stream:"")));classBox.append(label);}
   }
   async function load(){
      const generation=++epoch;if(!isAdmin()){clear();return;}
      form.hidden=true;table.replaceChildren();msg.textContent="Loading materials catalogue…";
      try{
       const [c,t,m]=await Promise.all([db.from("school_classes").select("id,name,stream").order("name"),db.from("academic_terms").select("id,name,starts_on,ends_on").eq("is_closed",false).order("starts_on"),db.from("school_material_catalogue").select("class_id,term_id,label,category,unit,quantity,duration,starts_on,ends_on").order("label").limit(1000)]);
       if(generation!==epoch||!isAdmin())return;
       if(c.error||t.error||m.error)throw Error("Catalogue backend not installed or access unavailable. No records changed.");
       classes=c.data||[];terms=t.data||[];populate();
       const names=new Map(classes.map(c=>[c.id,c.name+(c.stream?" · "+c.stream:"")]));
       for(const row of m.data||[]){const tr=add(table,"tr","");for(const value of [names.get(row.class_id)||"Historical class",row.label,row.category,row.quantity+" "+row.unit,row.duration,fmtDate(row.starts_on)+" – "+fmtDate(row.ends_on)])add(tr,"td",value);}
       msg.textContent=(m.data||[]).length+" catalogue assignments loaded (maximum 1,000 shown). No learner clearance or fee posting is implied.";
       form.hidden=!terms.length||!classes.length;
      }catch(e){if(generation===epoch&&isAdmin())msg.textContent=e.message;}
   }
   duration.addEventListener("change",()=>{custom.hidden=duration.value!=="custom";});
   $("materialCatalogueRefresh").addEventListener("click",load);
   form.addEventListener("submit",async event=>{
     event.preventDefault();if(!isAdmin()||form.hidden)return;const generation=epoch;const button=form.querySelector("button[type=submit]");button.disabled=true;
     try{
       const t=terms.find(row=>row.id===term.value),selected=[...classBox.querySelectorAll("input:checked")].map(x=>x.value),label=$("materialCatalogueLabel").value.trim(),unit=$("materialCatalogueUnit").value.trim(),q=Number($("materialCatalogueQty").value),d=duration.value,category=$("materialCatalogueCategory").value;
       if(!t||!selected.length||!label||!unit||!Number.isSafeInteger(q)||q<1||q>10000)throw Error("Choose classes and enter a valid material and quantity.");
       const end=d==="annual"?endAnnual(t.starts_on):d==="custom"?$("materialCatalogueEnd").value:t.ends_on;
       if(!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<t.starts_on)throw Error("Choose a valid end date.");
       if(!confirm("Publish this catalogue requirement for "+selected.length+" classes? This does not create a fee or learner clearance."))return;
       const rows=selected.map(class_id=>({class_id,term_id:t.id,label,unit,quantity:q,category,duration:d,starts_on:t.starts_on,ends_on:end}));
       const result=await db.from("school_material_catalogue").insert(rows);
       if(generation!==epoch||!isAdmin())return;
       if(result.error)throw Error("Publishing rejected. Check existing assignments, dates and permissions.");
       form.reset();custom.hidden=true;await load();
     }catch(e){if(generation===epoch&&isAdmin())msg.textContent=e.message;}finally{button.disabled=false;}
   });
   return {load,clear};
 }
 globalThis.CornhillHostedMaterialCatalogue=Object.freeze({setup});
})();
