/* CORNHILL school-wide document template studio.
   Original presets; preferences are stored in Supabase and shared across devices. */
(function () {
 'use strict';
 const bridge = function(){ return window.cornhillDocumentTemplateBridge || {}; };
 const esc = function(v){ return String(v == null ? '' : v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); };
 const themes = {
  nursery:[['Rainbow Garden','#D96B42','#FFF3E8'],['Ocean Friends','#1479A8','#EAF7FE'],['Sunshine Class','#B98518','#FFF9DB'],['Butterfly Lilac','#8055B7','#F5EEFF'],['Forest Explorers','#23784A','#EDF8EF']],
  lower_primary:[['Learning Blue','#2563A6','#EFF6FF'],['Fresh Green','#287A4C','#EDF8F0'],['Warm Coral','#C65F47','#FFF1EC'],['Bright Teal','#147D83','#EAF8F7'],['School Gold','#A77513','#FFF8E4']],
  upper_primary:[['Academic Navy','#23466F','#EFF4FA'],['Modern Emerald','#216B51','#ECF7F1'],['Classic Burgundy','#873E4C','#FAF0F2'],['Graphite Blue','#44556A','#F1F4F7'],['Cobalt Academic','#3157A4','#EEF2FF']],
  receipt:[['Official Green','#14532D','#F0FDF4'],['Ink Navy','#1E3A5F','#EFF4FA'],['Neutral Charcoal','#374151','#F3F4F6'],['Teal Ledger','#0F766E','#ECFDF5'],['Warm Burgundy','#7F1D35','#FFF1F2']]
 };
 const layoutNames=['Classic','Split header','Side panel','Minimal','Colour blocks'];
 const layouts=['classic','split','sidebar','minimal','blocks'];
 const motifs={nursery:['cartoon','nature'],lower_primary:['playful','nature'],upper_primary:['academic','geometric'],receipt:['none','ledger']};
 const names={nursery:['Rainbow','Little Garden','Happy Learners','Nature Trail','Storybook','Friendly Friends','Sunbeam','Butterfly','Green Meadow','Discovery'],lower_primary:['Bright Steps','Learning Path','Explorer','Achievement','Colour Blocks','Knowledge Garden','Pencil Lines','Star Progress','Blue Horizon','Fresh Start'],upper_primary:['Academic','Scholar','Executive','Modern Grid','Classic Ledger','Merit','Evergreen','Geometric','Heritage','Horizon'],receipt:['Official','Ledger','Compact','School Office','Classic','Modern','Clean Copy','Finance Desk','Trust','Simple']};
 const catalog={};
 function makeCatalog(section){
  const list=[{key:'classic-current',label:'Current CORNHILL default',layout:'classic',accent:'#14532d',tint:'#f0fdf4',font:'Arial',motif:'none'}];
  const usedLayouts=section==='receipt'?['classic','compact','ledger','outlined','wide']:layouts;
  for(let p=0;p<themes[section].length;p++){
   for(let l=0;l<usedLayouts.length;l++){
    for(let m=0;m<motifs[section].length;m++){
     if(list.length>=50)break;
     const theme=themes[section][p],motif=motifs[section][m],layout=usedLayouts[l];
     const heading=names[section][(p*2+l)%10];
     const displayLayout=layoutNames[layouts.indexOf(layout)]||layout.charAt(0).toUpperCase()+layout.slice(1);
     const motifLabel={cartoon:'Cartoon',nature:'Nature',playful:'Playful',academic:'Academic',geometric:'Geometry',ledger:'Ledger',none:'Clean'}[motif]||motif;
     list.push({key:section+'-'+String(list.length+1).padStart(2,'0'),label:heading+' · '+displayLayout+' · '+motifLabel,layout:layout,accent:theme[1],tint:theme[2],font:['Arial','Verdana','Trebuchet MS','Georgia','Tahoma'][(p+l+m)%5],motif:motif});
    }
   }
  }
  while(list.length<50){
   const i=list.length,theme=themes[section][i%5];
   list.push({key:section+'-'+String(i+1).padStart(2,'0'),label:names[section][i%10]+' · Style '+(i+1),layout:usedLayouts[i%usedLayouts.length],accent:theme[1],tint:theme[2],font:'Arial',motif:motifs[section][i%motifs[section].length]});
  }
  return list.slice(0,50);
 }
 ['nursery','lower_primary','upper_primary','receipt'].forEach(function(s){catalog[s]=makeCatalog(s);});
 const defaults={};
 ['nursery','lower_primary','upper_primary'].forEach(function(s){
  defaults['report_card|'+s]={template_key:'classic-current',settings:{layout:'classic',accent:'#14532d',tint:'#f0fdf4',font:'Arial',motif:'none',show:{identity:true,marks:true,summary:true,grading:true,comments:true,footer:true,signatures:true,parentPortal:true},customFields:[]}};
 });
 defaults['receipt|all']={template_key:'classic-current',settings:{layout:'classic',accent:'#14532d',tint:'#f0fdf4',font:'Arial',motif:'none',paperWidth:'80',show:{signatures:true},customFields:[]}};
 let prefs={},loadedFor=null,loadPromise=null,studioReady=false;
 function rowFor(type,section){return prefs[type+'|'+section]||defaults[type+'|'+section]||defaults['report_card|upper_primary'];}
 function getSettings(type,section){return rowFor(type,section).settings||{};}
 function loadPreferences(force){
  const b=bridge(),db=b.db,userId=b.userId;
  if(!db||!userId)return Promise.resolve(prefs);
  if(!force&&loadedFor===userId)return Promise.resolve(prefs);
  if(loadPromise&&!force)return loadPromise;
  loadPromise=db.from('school_document_template_settings').select('document_type,school_section,template_key,settings,updated_at').then(function(result){
   if(result.error)throw result.error;
   const next={};(result.data||[]).forEach(function(r){next[r.document_type+'|'+r.school_section]=r;});
   prefs=next;loadedFor=userId;window.cornhillDocumentTemplateSettings=prefs;
   window.dispatchEvent(new CustomEvent('cornhill:document-templates-updated'));return prefs;
  });
  return loadPromise.finally(function(){loadPromise=null;});
 }
 function attributes(type,section){
  const row=rowFor(type,section),s=row.settings||{},show=s.show||{};
  const color=/^#[0-9a-f]{6}$/i.test(s.accent||'')?s.accent:'#14532d';
  const tint=/^#[0-9a-f]{6}$/i.test(s.tint||'')?s.tint:'#f0fdf4';
  const font=['Arial','Verdana','Trebuchet MS','Georgia','Tahoma'].includes(s.font)?s.font:'Arial';
  const layout=/^[a-z-]{2,24}$/.test(s.layout||'')?s.layout:'classic';
  const motif=/^[a-z-]{2,24}$/.test(s.motif||'')?s.motif:'none';
  const hidden=Object.keys(show).filter(function(k){return show[k]===false;}).map(function(k){return k.replace(/[A-Z]/g,function(m){return '-'+m.toLowerCase();});});
  return 'data-document-template="'+esc(row.template_key||'classic-current')+'" data-document-layout="'+esc(layout)+'" data-document-motif="'+esc(motif)+'" data-document-hidden="'+esc(hidden.join(' '))+'" style="--document-accent:'+color+';--document-tint:'+tint+';--document-font:'+font+'"';
 }
 function customFieldsHtml(type,section){
  const fields=(getSettings(type,section).customFields||[]).filter(function(x){return x&&String(x.label||'').trim();}).slice(0,12);
  if(!fields.length)return '';
  return '<section class="document-custom-fields">'+fields.map(function(x){return '<p><strong>'+esc(String(x.label).slice(0,48))+':</strong> '+(String(x.value||'').trim()?esc(String(x.value).slice(0,100)):'................................................................')+'</p>';}).join('')+'</section>';
 }
 function initStudio(){
  if(studioReady)return;
  const settings=document.getElementById('settings'),launcher=settings&&settings.querySelector('.settings-launcher');
  if(!settings||!launcher)return;
  studioReady=true;
  launcher.insertAdjacentHTML('beforeend','<button type="button" data-doc-template-launch><span>11</span><strong>Document templates</strong><small>50 layouts per school section and 50 receipt layouts</small></button>');
  const markup='<section id="settingsDocuments" class="panel" style="margin:16px 0;padding:16px;border:1px solid var(--line,#dce6df);border-radius:14px">'+
   '<div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px"><div><h3 style="margin:0">Report-card & receipt template studio</h3><p class="muted">Choose an original layout, show or hide sections, add school fields and save one shared setting for all school devices. The current CORNHILL template stays as the default until you choose another.</p></div><span class="badge">150 report layouts · 50 receipt layouts</span></div>'+
   '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:12px;margin-top:14px">'+
   '<div><label for="docTemplateType">Document</label><select id="docTemplateType"><option value="report_card">Report card</option><option value="receipt">Payment receipt</option></select></div>'+
   '<div id="docTemplateSectionWrap"><label for="docTemplateSection">School section</label><select id="docTemplateSection"><option value="nursery">Nursery · Baby, Middle, Top</option><option value="lower_primary">Lower Primary · P1–P3</option><option value="upper_primary">Upper Primary · P4–P7</option></select></div>'+
   '<div><label for="docTemplatePreset">Design · 50 options</label><select id="docTemplatePreset"></select></div>'+
   '<div><label for="docTemplateLayout">Layout arrangement</label><select id="docTemplateLayout"><option value="classic">Classic</option><option value="split">Split header</option><option value="sidebar">Side panel</option><option value="minimal">Minimal</option><option value="blocks">Colour blocks</option><option value="compact">Compact</option><option value="ledger">Ledger</option><option value="outlined">Outlined</option><option value="wide">Wide</option></select></div>'+
   '<div><label for="docTemplateFont">Typeface</label><select id="docTemplateFont"><option>Arial</option><option>Verdana</option><option>Trebuchet MS</option><option>Georgia</option><option>Tahoma</option></select></div>'+
   '<div id="docTemplatePaperWrap"><label for="docTemplatePaper">Receipt paper</label><select id="docTemplatePaper"><option value="58">58 mm thermal</option><option value="80">80 mm thermal</option><option value="a4">A4</option></select></div>'+
   '<div><label for="docTemplateAccent">Accent colour</label><input id="docTemplateAccent" type="color" value="#14532d"></div>'+
   '<div><label for="docTemplateTint">Light background</label><input id="docTemplateTint" type="color" value="#f0fdf4"></div>'+
   '<div><label for="docTemplateMotif">Decorative style</label><select id="docTemplateMotif"><option value="none">No decoration</option><option value="cartoon">Cartoon / friendly</option><option value="nature">Nature / garden</option><option value="playful">Playful educational</option><option value="academic">Academic / formal</option><option value="geometric">Geometric</option><option value="ledger">Ledger</option></select></div></div>'+
   '<div id="docTemplateShowOptions" class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:7px;margin:14px 0">'+
   '<label><input type="checkbox" data-doc-show="identity" checked> Pupil information</label><label><input type="checkbox" data-doc-show="marks" checked> Marks table</label><label><input type="checkbox" data-doc-show="summary" checked> Total, position & division</label><label><input type="checkbox" data-doc-show="grading" checked> Nursery grading key</label><label><input type="checkbox" data-doc-show="comments" checked> Teacher / headteacher comments</label><label><input type="checkbox" data-doc-show="footer" checked> Fees & next-term footer</label><label><input type="checkbox" data-doc-show="signatures" checked> Signature lines</label><label><input type="checkbox" data-doc-show="parentPortal" checked> Parent portal link section</label></div>'+
   '<div class="panel" style="padding:12px;margin:10px 0"><strong>Add optional school fields (up to 12)</strong><div class="row" style="align-items:end;gap:8px;flex-wrap:wrap"><div style="flex:1;min-width:180px"><label for="docTemplateNewField">Field label</label><input id="docTemplateNewField" maxlength="48" placeholder="For example: Next term begins"></div><button id="docTemplateAddField" type="button">Add field</button></div><div id="docTemplateCustomFields" class="grid" style="gap:8px;margin-top:10px"></div></div>'+
   '<div id="docTemplatePreview" class="doc-template-preview" aria-live="polite"><strong>CORNHILL NURSERY AND PRIMARY SCHOOL</strong><div class="doc-template-preview-sub">Template preview · Learner · Class · Term</div><div class="doc-template-preview-grid"><span>English</span><span>Mathematics</span><span>Science</span><span>Social Studies</span></div><div class="doc-template-preview-foot">Current CORNHILL layout</div></div>'+
   '<div class="row" style="justify-content:flex-end;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap"><span id="docTemplateStatus" class="muted" aria-live="polite">Load saved preferences.</span><button id="docTemplateReset" type="button">Restore current default</button><button id="docTemplateSave" type="button" class="primary">Save school-wide template</button></div></section>';
  launcher.insertAdjacentHTML('afterend',markup);
  const style=document.createElement('style');
  style.textContent='.cornhill-report-card[data-document-template]{font-family:var(--document-font,Arial,sans-serif);border-top:5px solid var(--document-accent,#14532d)}'+
   '.cornhill-report-card[data-document-template] .report-school-head{border-bottom:3px solid var(--document-accent,#14532d)}'+
   '.cornhill-report-card[data-document-template] .report-school-head h1{color:var(--document-accent,#14532d)}'+
   '.cornhill-report-card[data-document-template] .report-marks thead th{background:var(--document-tint,#f0fdf4)!important;color:var(--document-accent,#14532d)}'+
   '.cornhill-report-card[data-document-template] .report-summary{border-left:4px solid var(--document-accent,#14532d);background:var(--document-tint,#f0fdf4)}'+
   '.cornhill-report-card[data-document-layout="split"] .report-school-head{display:grid;grid-template-columns:90px 1fr;align-items:center}'+
   '.cornhill-report-card[data-document-layout="sidebar"] .report-identity{border-left:5px solid var(--document-accent,#14532d);padding-left:10px}'+
   '.cornhill-report-card[data-document-layout="minimal"] .report-school-head{border-bottom:1px solid var(--document-accent,#14532d)}'+
   '.cornhill-report-card[data-document-layout="blocks"] .report-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:7px}'+
   '.cornhill-report-card[data-document-motif="cartoon"] .report-school-head:after{content:"🌈  ⭐  🦋  ⭐";display:block;text-align:center;font-size:19px}'+
   '.cornhill-report-card[data-document-motif="nature"] .report-school-head:after{content:"🌿  🍃  🌼  🌱";display:block;text-align:center;font-size:18px}'+
   '.cornhill-report-card[data-document-motif="playful"] .report-school-head:after{content:"✏️  📚  ⭐";display:block;text-align:center;font-size:16px}'+
   '.cornhill-report-card[data-document-hidden~="identity"] .report-identity,.cornhill-report-card[data-document-hidden~="marks"] .report-marks,.cornhill-report-card[data-document-hidden~="summary"] .report-summary,.cornhill-report-card[data-document-hidden~="grading"] .report-grading,.cornhill-report-card[data-document-hidden~="comments"] .report-comments,.cornhill-report-card[data-document-hidden~="footer"] .report-footer,.cornhill-report-card[data-document-hidden~="parent-portal"] .parent-portal-report{display:none!important}'+
   '.cornhill-report-card[data-document-hidden~="signatures"] .report-comments>div{display:none!important}'+
   '.cornhill-document-receipt[data-document-template] .receipt-copy{font-family:var(--document-font,Arial,sans-serif);border-top:3px solid var(--document-accent,#14532d);padding-top:5px}'+
   '.cornhill-document-receipt[data-document-template] .receipt-copy-label{color:var(--document-accent,#14532d)}'+
   '.cornhill-document-receipt[data-document-layout="compact"] .receipt-copy{font-size:10px}'+
   '.cornhill-document-receipt[data-document-layout="ledger"] .receipt-copy{border:1px dashed var(--document-accent,#14532d);padding:7px}'+
   '.cornhill-document-receipt[data-document-layout="outlined"] .receipt-copy{border:2px solid var(--document-accent,#14532d);padding:8px}'+
   '.cornhill-document-receipt[data-document-hidden~="signatures"] .receipt-signatures{display:none!important}'+
   '.document-custom-fields{margin:9px 0;padding:7px 9px;border-top:1px dashed var(--document-accent,#14532d);font-size:10px}'+
   '.doc-template-field-row{display:grid;grid-template-columns:1fr 1fr auto;gap:7px;align-items:center}'+
   '.doc-template-preview{border:2px solid var(--document-accent,#14532d);border-radius:12px;padding:14px;margin-top:12px;background:var(--document-tint,#f0fdf4);font-family:var(--document-font,Arial,sans-serif)}'+
   '.doc-template-preview-sub{font-size:12px;margin:6px 0 12px}.doc-template-preview-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.doc-template-preview-grid span{padding:10px 4px;text-align:center;background:#fff;border:1px solid var(--document-accent,#14532d);border-radius:5px;font-size:11px}.doc-template-preview-foot{font-size:11px;margin-top:12px}@media(max-width:520px){.doc-template-field-row{grid-template-columns:1fr}.doc-template-preview-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}';
  document.head.appendChild(style);
  const $=function(id){return document.getElementById(id);};
  const type=$('docTemplateType'),section=$('docTemplateSection'),preset=$('docTemplatePreset');
  let editing={template_key:'classic-current',settings:{}};
  function target(){return {type:type.value,section:type.value==='receipt'?'all':section.value};}
  function status(text,error){$('docTemplateStatus').textContent=text;$('docTemplateStatus').style.color=error?'#b42318':'';}
  function snapshot(){
   const settings={layout:$('docTemplateLayout').value,font:$('docTemplateFont').value,accent:$('docTemplateAccent').value,tint:$('docTemplateTint').value,motif:$('docTemplateMotif').value,paperWidth:$('docTemplatePaper').value,show:{},customFields:[]};
   document.querySelectorAll('[data-doc-show]').forEach(function(box){settings.show[box.dataset.docShow]=box.checked;});
   document.querySelectorAll('.doc-template-field-row').forEach(function(row){const label=row.querySelector('[data-field-label]').value.trim(),value=row.querySelector('[data-field-value]').value.trim();if(label)settings.customFields.push({label:label.slice(0,48),value:value.slice(0,100)});});
   return {template_key:preset.value,settings:settings};
  }
  function render(state){
   const t=target(),items=catalog[t.type==='receipt'?'receipt':t.section],choice=items.find(function(x){return x.key===state.template_key;})||items[0];
   preset.innerHTML=items.map(function(x){return '<option value="'+esc(x.key)+'">'+esc(x.label)+'</option>';}).join('');
   preset.value=choice.key;
   $('docTemplateLayout').value=state.settings.layout||choice.layout;
   $('docTemplateFont').value=state.settings.font||choice.font;
   $('docTemplateAccent').value=state.settings.accent||choice.accent;
   $('docTemplateTint').value=state.settings.tint||choice.tint;
   $('docTemplateMotif').value=state.settings.motif||choice.motif;
   $('docTemplatePaper').value=state.settings.paperWidth||'80';
   document.querySelectorAll('[data-doc-show]').forEach(function(box){box.checked=state.settings.show?state.settings.show[box.dataset.docShow]!==false:true;box.closest('label').style.display=t.type==='receipt'&&box.dataset.docShow!=='signatures'?'none':'';});
   $('docTemplateShowOptions').style.display=t.type==='receipt'?'block':'grid';
   $('docTemplatePaperWrap').style.display=t.type==='receipt'?'':'none';
   $('docTemplateSectionWrap').style.display=t.type==='receipt'?'none':'';
   $('docTemplateCustomFields').innerHTML=(state.settings.customFields||[]).map(function(f,i){return '<div class="doc-template-field-row" data-field-index="'+i+'"><input data-field-label maxlength="48" aria-label="Custom field label" value="'+esc(f.label||'')+'"><input data-field-value maxlength="100" aria-label="Custom field value" value="'+esc(f.value||'')+'"><button type="button" data-field-remove="'+i+'">Remove</button></div>';}).join('')||'<p class="muted">No custom fields added.</p>';
   updatePreview(state);
  }
  function updatePreview(state){
   const t=target(),items=catalog[t.type==='receipt'?'receipt':t.section],choice=items.find(function(x){return x.key===state.template_key;})||items[0],el=$('docTemplatePreview');
   el.style.setProperty('--document-accent',state.settings.accent||choice.accent);el.style.setProperty('--document-tint',state.settings.tint||choice.tint);el.style.setProperty('--document-font',state.settings.font||choice.font);
   el.style.borderRadius=state.settings.layout==='minimal'?'3px':state.settings.layout==='blocks'?'16px':'12px';
   $('docTemplatePreview').dataset.documentMotif=state.settings.motif||choice.motif;
   el.querySelector('strong').textContent=t.type==='receipt'?'CORNHILL NURSERY AND PRIMARY SCHOOL · OFFICIAL RECEIPT':'CORNHILL NURSERY AND PRIMARY SCHOOL';
   el.querySelector('.doc-template-preview-foot').textContent='Selected: '+choice.label+' · '+(state.settings.layout||choice.layout)+' layout · '+(state.settings.motif||choice.motif)+' motif';
  }
  async function loadEditor(){
   const b=bridge();
   if(!b.profile||b.profile.role!=='Admin'){status('Only an administrator can change school-wide templates.',true);return;}
   try{await loadPreferences(true);const t=target(),row=rowFor(t.type,t.section);editing={template_key:row.template_key,settings:Object.assign({},row.settings||{})};render(editing);status(catalog[t.type==='receipt'?'receipt':t.section].length+' designs loaded. Current layout remains default until saved.');}
   catch(error){status('Could not load preferences: '+(error.message||String(error)),true);}
  }
  document.querySelector('[data-doc-template-launch]').addEventListener('click',function(){ $('settingsDocuments').scrollIntoView({behavior:'smooth',block:'start'});loadEditor();});
  type.addEventListener('change',function(){if(type.value==='receipt')section.value='nursery';loadEditor();});
  section.addEventListener('change',loadEditor);
  preset.addEventListener('change',function(){const t=target(),choice=catalog[t.type==='receipt'?'receipt':t.section].find(function(x){return x.key===preset.value;});if(!choice)return;editing={template_key:choice.key,settings:Object.assign({},editing.settings,{layout:choice.layout,font:choice.font,accent:choice.accent,tint:choice.tint,motif:choice.motif})};render(editing);});
  ['docTemplateLayout','docTemplateFont','docTemplateAccent','docTemplateTint','docTemplateMotif','docTemplatePaper'].forEach(function(id){$(id).addEventListener('change',function(){editing=snapshot();updatePreview(editing);});});
  document.querySelectorAll('[data-doc-show]').forEach(function(box){box.addEventListener('change',function(){editing=snapshot();updatePreview(editing);});});
  $('docTemplateAddField').addEventListener('click',function(){editing=snapshot();if(editing.settings.customFields.length>=12){status('A template can contain up to 12 custom fields.',true);return;}const label=$('docTemplateNewField').value.trim();if(!label){status('Enter a field label first.',true);return;}editing.settings.customFields.push({label:label.slice(0,48),value:''});$('docTemplateNewField').value='';render(editing);});
  $('docTemplateCustomFields').addEventListener('click',function(event){const btn=event.target.closest('[data-field-remove]');if(!btn)return;editing=snapshot();editing.settings.customFields.splice(Number(btn.dataset.fieldRemove),1);render(editing);});
  $('docTemplateCustomFields').addEventListener('input',function(){editing=snapshot();updatePreview(editing);});
  $('docTemplateReset').addEventListener('click',function(){editing=JSON.parse(JSON.stringify(defaults[target().type+'|'+target().section]));render(editing);status('Current CORNHILL template restored in editor. Save to apply it.');});
  $('docTemplateSave').addEventListener('click',async function(){
   const b=bridge(),t=target();if(!b.db||!b.userId||!b.profile||b.profile.role!=='Admin'){status('Only a signed-in administrator can save templates.',true);return;}
   const state=snapshot(),button=$('docTemplateSave');button.disabled=true;button.textContent='Saving…';
   try{
    const record={document_type:t.type,school_section:t.section,template_key:state.template_key,settings:state.settings,updated_by:b.userId,updated_at:new Date().toISOString()};
    const result=await b.db.from('school_document_template_settings').upsert(record,{onConflict:'document_type,school_section'});
    if(result.error)throw result.error;
    prefs[t.type+'|'+t.section]=record;window.cornhillDocumentTemplateSettings=prefs;
    window.dispatchEvent(new CustomEvent('cornhill:document-templates-updated'));status('Saved across CORNHILL devices. Newly opened report cards and receipts will use this selection.');
   }catch(error){status('Template was not saved: '+(error.message||String(error)),true);}
   finally{button.disabled=false;button.textContent='Save school-wide template';}
  });
 }
 const runtime={catalog:catalog,loadPreferences:loadPreferences,getSettings:getSettings,attributes:attributes,customFieldsHtml:customFieldsHtml,getCatalogCounts:function(){return {nursery:50,lower_primary:50,upper_primary:50,receipt:50};}};
 window.cornhillDocumentTemplateRuntime=runtime;window.cornhillDocumentTemplateSettings=prefs;
 function start(){initStudio();if(bridge().userId)loadPreferences().catch(function(e){console.warn('Template preferences unavailable',e);});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
 window.addEventListener('cornhill:document-templates-updated',function(){});
})();
