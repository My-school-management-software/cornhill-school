'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const studioPath = path.join(__dirname, '../assets/cornhill-document-template-studio.js');
const studioSource = fs.readFileSync(studioPath, 'utf8');

function boot(options = {}) {
  const events = [];
  const values = new Map(Object.entries(options.storage || {}));
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
  const fakeWindow = {
    cornhillDocumentTemplateBridge: options.bridge || {},
    addEventListener(name, handler) { events.push({ name, handler }); },
    dispatchEvent(event) { events.push({ dispatched: event.type }); return true; },
    applyReceiptPaperWidth() { events.push({ appliedReceiptPaperWidth: true }); }
  };
  const fakeDocument = {
    readyState: 'complete',
    getElementById() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
  class FakeCustomEvent { constructor(type) { this.type = type; } }
  vm.runInNewContext(studioSource, {
    window: fakeWindow,
    document: fakeDocument,
    localStorage: storage,
    CustomEvent: FakeCustomEvent,
    console
  }, { filename: studioPath });
  return {
    runtime: fakeWindow.cornhillDocumentTemplateRuntime,
    window: fakeWindow,
    events,
    storage,
    values
  };
}

test('the studio exposes exactly ten class-specific report-card settings keys', () => {
  const { runtime } = boot();
  assert.deepEqual(Object.keys(runtime.classGroups).sort(),
    ['baby','middle','top','p1','p2','p3','p4','p5','p6','p7'].sort());
});

test('Baby, Middle and Top are assigned to the nursery design family', () => {
  const { runtime } = boot();
  for (const key of ['baby','middle','top']) assert.equal(runtime.classGroups[key], 'nursery');
});

test('P1-P3 use lower-primary designs', () => {
  const { runtime } = boot();
  for (const key of ['p1','p2','p3']) assert.equal(runtime.classGroups[key], 'lower_primary');
});

test('P4-P7 use upper-primary designs', () => {
  const { runtime } = boot();
  for (const key of ['p4','p5','p6','p7']) assert.equal(runtime.classGroups[key], 'upper_primary');
});

test('the class catalog advertises fifty designs for each of the ten classes', () => {
  const { runtime } = boot();
  const counts = runtime.getCatalogCounts();
  for (const key of Object.keys(runtime.classGroups)) assert.equal(counts[key], 50, key);
});

test('the shared receipt catalog advertises fifty designs', () => {
  const { runtime } = boot();
  assert.equal(runtime.getCatalogCounts().receipt, 50);
});

test('every class family begins with the unchanged CORNHILL default', () => {
  const { runtime } = boot();
  for (const family of ['nursery','lower_primary','upper_primary','receipt']) {
    assert.equal(runtime.catalog[family][0].key, 'classic-current');
  }
});

test('each family catalog has unique design identifiers', () => {
  const { runtime } = boot();
  for (const family of ['nursery','lower_primary','upper_primary','receipt']) {
    const keys = runtime.catalog[family].map(item => item.key);
    assert.equal(new Set(keys).size, keys.length, family);
  }
});

test('all catalog designs contain safe hexadecimal accent and tint colours', () => {
  const { runtime } = boot();
  for (const family of ['nursery','lower_primary','upper_primary','receipt']) {
    for (const item of runtime.catalog[family]) {
      assert.match(item.accent, /^#[0-9a-f]{6}$/i, item.key);
      assert.match(item.tint, /^#[0-9a-f]{6}$/i, item.key);
    }
  }
});

test('all catalog designs use one of the supported typefaces', () => {
  const { runtime } = boot();
  const allowed = new Set(['Arial','Verdana','Trebuchet MS','Georgia','Tahoma']);
  for (const family of ['nursery','lower_primary','upper_primary','receipt']) {
    for (const item of runtime.catalog[family]) assert.ok(allowed.has(item.font), item.key);
  }
});

test('receipt designs include compact and ledger-friendly arrangements', () => {
  const { runtime } = boot();
  const layouts = new Set(runtime.catalog.receipt.map(item => item.layout));
  for (const layout of ['classic','compact','ledger','outlined','wide']) assert.ok(layouts.has(layout));
});

test('nursery class labels resolve to their individual class template keys', () => {
  const { runtime } = boot();
  assert.equal(runtime.classKeyForClassName('Baby Class'), 'baby');
  assert.equal(runtime.classKeyForClassName('Middle Class'), 'middle');
  assert.equal(runtime.classKeyForClassName('Top Class'), 'top');
});

test('primary class naming variants resolve consistently', () => {
  const { runtime } = boot();
  for (let n=1;n<=7;n++) {
    assert.equal(runtime.classKeyForClassName('P'+n), 'p'+n);
    assert.equal(runtime.classKeyForClassName('P.'+n), 'p'+n);
    assert.equal(runtime.classKeyForClassName('Primary '+n), 'p'+n);
  }
});

test('unrecognized class names do not silently receive another class template', () => {
  const { runtime } = boot();
  assert.equal(runtime.classKeyForClassName('Reception'), null);
  assert.equal(runtime.classKeyForClassName('Primary 8'), null);
  assert.equal(runtime.classKeyForClassName(''), null);
});

test('applyAttributes applies the correct saved class design', () => {
  const { runtime } = boot();
  const attrs = {}, styles = {};
  const element = { setAttribute(k,v){attrs[k]=v;}, style:{setProperty(k,v){styles[k]=v;}} };
  assert.equal(runtime.applyAttributes(element,'report_card','P.5'), true);
  assert.equal(attrs['data-document-template'], 'classic-current');
  assert.equal(attrs['data-document-layout'], 'classic');
  assert.equal(styles['--document-accent'], '#14532d');
});

test('applyAttributes rejects unknown report-card class names', () => {
  const { runtime } = boot();
  const element = { setAttribute(){}, style:{setProperty(){}} };
  assert.equal(runtime.applyAttributes(element,'report_card','Primary 8'), false);
});

test('receipt attributes always resolve to the shared receipt settings row', () => {
  const { runtime } = boot();
  const attrs = {}, styles = {};
  const element = { setAttribute(k,v){attrs[k]=v;}, style:{setProperty(k,v){styles[k]=v;}} };
  assert.equal(runtime.applyAttributes(element,'receipt','not-a-class'), true);
  assert.equal(attrs['data-document-template'], 'classic-current');
  assert.equal(styles['--document-font'], 'Arial');
});

test('attribute rendering escapes saved template keys before placing them in HTML attributes', async () => {
  const { runtime } = boot({ bridge:{userId:'admin-1',db:{from(){return {select(){return Promise.resolve({data:[{
    document_type:'report_card',school_section:'p4',template_key:'x" onmouseover="alert(1)',settings:{}
  }],error:null});}};}}} });
  await runtime.loadPreferences(true);
  const attrs = runtime.attributes('report_card','p4');
  assert.match(attrs, /data-document-template="x&quot; onmouseover=&quot;alert\\(1\\)"/);
  assert.doesNotMatch(attrs, /data-document-template="x" onmouseover=/);
});

test('untrusted saved colours, layout, motif and font are replaced with safe defaults', async () => {
  const { runtime } = boot({ bridge:{userId:'admin-1',db:{from(){return {select(){return Promise.resolve({data:[{
    document_type:'report_card',school_section:'p4',template_key:'custom',settings:{
      accent:'red; background:url(https://bad)',tint:'expression(alert(1))',
      font:'url(evil)',layout:'</style>',motif:'<script>'
    }
  }],error:null});}};}}} });
  await runtime.loadPreferences(true);
  const attrs = runtime.attributes('report_card','p4');
  assert.match(attrs, /--document-accent:#14532d/);
  assert.match(attrs, /--document-tint:#f0fdf4/);
  assert.match(attrs, /--document-font:Arial/);
  assert.match(attrs, /data-document-layout="classic"/);
  assert.match(attrs, /data-document-motif="none"/);
});

test('default templates have no optional custom fields', () => {
  const { runtime } = boot();
  assert.equal(runtime.customFieldsHtml('report_card','p4'), '');
  assert.equal(runtime.customFieldsHtml('receipt','all'), '');
});

test('custom report-card fields are HTML-escaped', async () => {
  const { runtime } = boot({ bridge:{userId:'admin-1',db:{from(){return {select(){return Promise.resolve({data:[{
    document_type:'report_card',school_section:'p4',template_key:'classic-current',
    settings:{customFields:[{label:'<img src=x onerror=alert(1)>',value:'<script>alert(1)</script>'}]}
  }],error:null});}};}}} });
  await runtime.loadPreferences(true);
  const html = runtime.customFieldsHtml('report_card','p4');
  assert.doesNotMatch(html, /<img|<script>/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script&gt;/);
});

test('custom school fields are capped at twelve and long values are bounded', async () => {
  const fields = Array.from({length:16},(_,i)=>({label:'Field '+i,value:'V'.repeat(130)}));
  const { runtime } = boot({ bridge:{userId:'admin-1',db:{from(){return {select(){return Promise.resolve({data:[{
    document_type:'report_card',school_section:'p7',template_key:'custom',settings:{customFields:fields}
  }],error:null});}};}}} });
  await runtime.loadPreferences(true);
  const html = runtime.customFieldsHtml('report_card','p7');
  assert.equal((html.match(/<p>/g)||[]).length, 12);
  assert.ok(!html.includes('V'.repeat(101)));
});

test('saved 58 mm receipts update the device print setting', async () => {
  const { runtime, values, events } = boot({ bridge:{userId:'admin-1',db:{from(){return {select(){return Promise.resolve({data:[{
    document_type:'receipt',school_section:'all',template_key:'compact',settings:{paperWidth:'58'}
  }],error:null});}};}}} });
  await runtime.loadPreferences(true);
  assert.equal(values.get('cornhill_receipt_paper_width'), '58');
  assert.ok(events.some(e => e.appliedReceiptPaperWidth));
});

test('legacy or unsupported paper-width values safely fall back to 80 mm', async () => {
  const { runtime, values, events } = boot({ bridge:{userId:'admin-1',db:{from(){return {select(){return Promise.resolve({data:[{
    document_type:'receipt',school_section:'all',template_key:'classic-current',settings:{paperWidth:'a4'}
  }],error:null});}};}}} });
  await runtime.loadPreferences(true);
  assert.equal(values.get('cornhill_receipt_paper_width'), '80');
  assert.ok(events.some(e => e.appliedReceiptPaperWidth));
});

test('the editor offers only the two paper sizes supported by the receipt print engine', () => {
  assert.match(studioSource, /58 mm thermal/);
  assert.match(studioSource, /80 mm thermal/);
  assert.doesNotMatch(studioSource, /option value="a4"/i);
});

test('the template editor and save handler both enforce Director/Admin-only changes', () => {
  assert.match(studioSource, /if\(!b\.profile\|\|b\.profile\.role!=='Admin'\)/);
  assert.match(studioSource, /if\(!b\.db\|\|!b\.userId\|\|!b\.profile\|\|b\.profile\.role!=='Admin'\)/);
});

test('template updates use the class-specific unique key and record the saving account', () => {
  assert.match(studioSource, /onConflict:'document_type,school_section'/);
  assert.match(studioSource, /updated_by:b\.userId/);
  assert.match(studioSource, /updated_at:new Date\(\)\.toISOString\(\)/);
});

test('loading templates without an authenticated database bridge is harmless', async () => {
  const { runtime } = boot();
  const result = await runtime.loadPreferences(true);
  assert.equal(Object.keys(result).length, 0);
});

test('failed preference loads reject without replacing already-loaded preferences', async () => {
  let call = 0;
  const db = {from(){return {select(){call++;return Promise.resolve(call===1
    ? {data:[{document_type:'report_card',school_section:'p1',template_key:'saved',settings:{accent:'#123456'}}],error:null}
    : {data:null,error:new Error('network unavailable')});}};}};
  const { runtime } = boot({bridge:{userId:'admin-1',db}});
  await runtime.loadPreferences(true);
  await assert.rejects(runtime.loadPreferences(true), /network unavailable/);
  assert.equal(runtime.getSettings('report_card','p1').accent, '#123456');
});

test('saved preferences are broadcast so open report and receipt previews can refresh', () => {
  const { events } = boot();
  assert.ok(events.some(e => e.name==='cornhill:document-templates-updated'));
});

test('receipt template paper width no longer exposes a non-functional A4 selection', () => {
  assert.doesNotMatch(studioSource, /value="a4">A4/);
  assert.match(studioSource, /paperWidth==='58'\?'58':'80'/);
});
