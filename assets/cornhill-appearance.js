/* Shared CORNHILL appearance preferences for authenticated staff workspaces.
   The preference key is intentionally identical to the main school dashboard. */
(function () {
  'use strict';
  const PREFIX = 'cornhill_appearance_v1:';
  const DEFAULTS = Object.freeze({
    theme: 'forest', font: 'system', motion: 'off', fontSize: '16',
    density: 'comfortable', dashboardLayout: 'executive',
    navigationLayout: 'left'
  });
  const PALETTES = {
    forest:['#166534','#14532d','#f3f7f3','#ffffff','#17251c','#607265','#dce7de'],
    ocean:['#0369a1','#0c4a6e','#eff8fc','#ffffff','#102b3b','#526d7b','#cfe3ed'],
    royal:['#6d28d9','#4c1d95','#f7f3ff','#ffffff','#281a3e','#716582','#e3d8f4'],
    sunrise:['#c2410c','#9a3412','#fff7ed','#ffffff','#3b2419','#806b5d','#f1ddcb'],
    ruby:['#be123c','#881337','#fff1f2','#ffffff','#3f1722','#80616b','#f2d4dc'],
    midnight:['#38bdf8','#0f172a','#111827','#1f2937','#f3f4f6','#c0cad8','#374151'],
    slate:['#475569','#1e293b','#f1f5f9','#ffffff','#1e293b','#64748b','#d8e0e9'],
    teal:['#0f766e','#134e4a','#f0fdfa','#ffffff','#153b38','#5c7773','#cce9e4'],
    emerald:['#059669','#064e3b','#ecfdf5','#ffffff','#12372b','#527568','#c9e8d9'],
    lavender:['#8b5cf6','#4c1d95','#f5f3ff','#ffffff','#2e2250','#746b8a','#e4dcf5'],
    sand:['#a16207','#713f12','#fffbeb','#fffefa','#3d3020','#82735b','#eadfca'],
    graphite:['#94a3b8','#0f172a','#0b1220','#182235','#f1f5f9','#aab7c9','#334155'],
    aurora:['#0f766e','#164e63','#effcfb','#ffffff','#143b3a','#5a7774','#cfe8e2'],
    cobalt:['#2563eb','#1e40af','#eff6ff','#ffffff','#172554','#64748b','#dbeafe'],
    coral:['#e11d48','#9f1239','#fff1f2','#ffffff','#4c0519','#80616b','#fecdd3'],
    rose:['#be185d','#831843','#fdf2f8','#ffffff','#500724','#9d647e','#fbcfe8'],
    arctic:['#0891b2','#155e75','#ecfeff','#ffffff','#164e63','#5b7e8a','#c8edf2'],
    indigo:['#4f46e5','#312e81','#eef2ff','#ffffff','#24205c','#69739a','#d7dcff'],
    'warm-corporate':['#2f6b45','#183e2a','#f8f6ef','#fffefa','#26342a','#68766c','#e5e1d4'],
    'finance-navy':['#17608a','#102b45','#f2f5f8','#ffffff','#1c2938','#647487','#dbe3ec'],
    'paper-swiss':['#a82727','#222222','#f4f2ec','#fffefa','#171717','#57534e','#d6d3cc'],
    'glass-mint':['#0f8278','#124b47','#edf7f4','#fbfffd','#173b37','#5d7771','#cde4de']
  };
  const FONTS = {
    system:'Inter,system-ui,-apple-system,Segoe UI,sans-serif', arial:'Arial,sans-serif',
    verdana:'Verdana,sans-serif', tahoma:'Tahoma,sans-serif', trebuchet:'Trebuchet MS,sans-serif',
    georgia:'Georgia,serif', times:'Times New Roman,serif', courier:'Courier New,monospace',
    lucida:'Lucida Sans Unicode,Lucida Grande,sans-serif',
    palatino:'Palatino Linotype,Book Antiqua,Palatino,serif', garamond:'Garamond,serif',
    bookman:'Bookman Old Style,serif', comic:'Comic Sans MS,cursive', impact:'Impact,Charcoal,sans-serif',
    segoe:'Segoe UI,sans-serif', calibri:'Calibri,Candara,sans-serif',
    candara:'Candara,Calibri,sans-serif', optima:'Optima,Segoe,sans-serif',
    futura:'Futura,Century Gothic,sans-serif', gill:'Gill Sans,Gill Sans MT,sans-serif',
    century:'Century Gothic,sans-serif', franklin:'Franklin Gothic Medium,sans-serif',
    monaco:'Monaco,monospace', consolas:'Consolas,monospace'
  };
  const THEME_LABELS = {
    forest:'Forest green',ocean:'Ocean blue',royal:'Royal purple',sunrise:'Sunrise orange',
    ruby:'Ruby red',midnight:'Midnight dark',slate:'Slate grey',teal:'Teal calm',
    emerald:'Emerald',lavender:'Lavender mist',sand:'Warm sand',graphite:'Graphite dark',
    aurora:'Aurora teal',cobalt:'Cobalt blue',coral:'Coral glow',rose:'Rose garden',
    arctic:'Arctic cyan',indigo:'Indigo dusk','warm-corporate':'Warm corporate',
    'finance-navy':'Financial navy','paper-swiss':'Swiss paper','glass-mint':'Glass mint'
  };
  const FONT_LABELS = {
    system:'System default',arial:'Arial',verdana:'Verdana',tahoma:'Tahoma',
    trebuchet:'Trebuchet MS',georgia:'Georgia',times:'Times New Roman',courier:'Courier New',
    lucida:'Lucida Sans',palatino:'Palatino',garamond:'Garamond',bookman:'Bookman',
    comic:'Comic Sans MS',impact:'Impact',segoe:'Segoe UI',calibri:'Calibri',
    candara:'Candara',optima:'Optima',futura:'Futura',gill:'Gill Sans',
    century:'Century Gothic',franklin:'Franklin Gothic',monaco:'Monaco',consolas:'Consolas'
  };
  const LAYOUTS = [
    ['executive','Executive overview'],['modern-grid','Modern card grid'],
    ['compact-tiles','Compact quick tiles'],['sidebar-list','Professional list'],
    ['colorful','Colourful school tiles'],['minimal','Minimal clean'],
    ['wide-cards','Wide feature cards'],['icon-focus','Icon-focused layout'],
    ['split','Split workspace'],['classic','Classic office'],
    ['command-center','Command centre'],['soft-glass','Soft glass'],
    ['editorial','Editorial'],['focus-workspace','Focus workspace'],
    ['bento-grid','Bento grid'],['floating-minimal','Floating minimal'],
    ['split-screen','Split-screen'],['editorial-swiss','Editorial Swiss']
  ];
  let ACTIVE_USER_ID = null;
  const keyFor = id => PREFIX + String(id);
  function safeParse(value) {
    try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' ? parsed : {}; }
    catch (_) { return {}; }
  }
  function normalise(prefs) {
    const p = Object.assign({}, DEFAULTS, prefs || {});
    if (!Object.prototype.hasOwnProperty.call(PALETTES, p.theme)) p.theme = DEFAULTS.theme;
    if (!Object.prototype.hasOwnProperty.call(FONTS, p.font)) p.font = DEFAULTS.font;
    if (!LAYOUTS.some(x => x[0] === p.dashboardLayout)) p.dashboardLayout = DEFAULTS.dashboardLayout;
    if (!['left','top','right','rail'].includes(p.navigationLayout)) p.navigationLayout = DEFAULTS.navigationLayout;
    if (!['14','16','18','20'].includes(String(p.fontSize))) p.fontSize = DEFAULTS.fontSize;
    p.fontSize = String(p.fontSize);
    p.density = p.density === 'compact' ? 'compact' : 'comfortable';
    p.motion = p.motion === 'on' ? 'on' : 'off';
    return p;
  }
  function getForUser(userId) {
    if (typeof userId !== 'string' || !userId.trim()) return Object.assign({}, DEFAULTS);
    try { return normalise(safeParse(localStorage.getItem(keyFor(userId)))); }
    catch (_) { return Object.assign({}, DEFAULTS); }
  }
  function ensureAppearanceStyles() {
    if (!document.head || document.getElementById('cornhillAppearanceOverrides')) return;
    const style = document.createElement('style');
    style.id = 'cornhillAppearanceOverrides';
    style.textContent = `
      body[data-theme] { background:var(--cornhill-page)!important; color:var(--cornhill-ink)!important; }
      body[data-theme] :is(.panel,.card,.stat,.tile,.account,.txn,.module,.workspace-card,.dashboard-card,.content-card,.section-card) {
        background-color:var(--cornhill-panel)!important; color:var(--cornhill-ink)!important;
        border-color:var(--cornhill-line)!important;
      }
      body[data-theme] :is(header.top,.top,.sidebar,.app-sidebar,.main-nav,.navbar) {
        background-color:var(--cornhill-accent-dark)!important;
      }
      body[data-theme] :is(h1,h2,h3,h4,.brand,.section-head,.kicker) { color:var(--cornhill-ink)!important; }
      body[data-theme] :is(header.top,.top) { color:#fff!important; }
      body[data-theme] :is(header.top,.top) :is(h1,h2,h3,h4,.brand,.section-head,.kicker,a:not(.button):not(.cta),.sub) { color:#fff!important; }
      body[data-theme] :is(label,.muted,.small,.sub,.stat small,.record-meta) { color:var(--cornhill-muted)!important; }
      body[data-theme] :is(input,select,textarea) {
        background-color:var(--cornhill-panel)!important; color:var(--cornhill-ink)!important;
        border-color:var(--cornhill-line)!important;
      }
      body[data-theme] :is(button,.button,a.button) {
        border-color:var(--cornhill-line); 
      }
      body[data-theme] :is(button.primary,.btn-primary,.primary,.cta) {
        background-color:var(--cornhill-accent)!important; color:#fff!important;
      }
      body[data-theme] :is(a:not(.button):not(.cta)) { color:var(--cornhill-accent)!important; }
      body[data-theme] table :is(th,td) { border-color:var(--cornhill-line)!important; }
      body[data-theme] table th { background-color:var(--cornhill-page)!important; color:var(--cornhill-muted)!important; }
      body[data-theme] .notice:not(.error):not(.success), body[data-theme] .info { border-color:var(--cornhill-line)!important; }
      body[data-theme][data-density="compact"] :is(.panel,.card,.stat,.tile) { padding:clamp(8px,1.2vw,12px)!important; }
      body[data-theme][data-density="comfortable"] :is(.panel,.card,.stat,.tile) { padding:revert-layer; }
      body[data-theme][data-motion="off"] *, body[data-theme][data-motion="off"] *::before,
      body[data-theme][data-motion="off"] *::after { animation-duration:0.01ms!important; animation-iteration-count:1!important; scroll-behavior:auto!important; transition-duration:0.01ms!important; }
      body[data-theme][data-motion="on"] :is(button,.button,.card,.panel) { transition:transform .16s ease,box-shadow .16s ease,background-color .16s ease; }
      body[data-theme][data-dashboard-layout="compact-tiles"] .dashboard-grid,
      body[data-theme][data-dashboard-layout="compact-tiles"] .modules-grid,
      body[data-theme][data-dashboard-layout="compact-tiles"] .module-grid { gap:8px!important; }
      body[data-theme][data-dashboard-layout="wide-cards"] .dashboard-grid,
      body[data-theme][data-dashboard-layout="wide-cards"] .modules-grid,
      body[data-theme][data-dashboard-layout="wide-cards"] .module-grid { grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))!important; }
      body[data-theme][data-dashboard-layout="bento-grid"] .dashboard-grid,
      body[data-theme][data-dashboard-layout="bento-grid"] .modules-grid,
      body[data-theme][data-dashboard-layout="bento-grid"] .module-grid { grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))!important; gap:14px!important; }
      body[data-theme][data-dashboard-layout="minimal"] .dashboard-grid,
      body[data-theme][data-dashboard-layout="minimal"] .modules-grid,
      body[data-theme][data-dashboard-layout="minimal"] .module-grid { gap:8px!important; }
      body[data-theme][data-navigation-layout="top"] :is(.sidebar,.app-sidebar) { position:static!important;width:100%!important; }
      body[data-theme][data-navigation-layout="right"] :is(.sidebar,.app-sidebar) { order:2!important; }
      body[data-theme][data-navigation-layout="rail"] :is(.sidebar,.app-sidebar) { width:76px!important; }
      @media(prefers-reduced-motion:reduce) { body[data-theme] *,body[data-theme] *::before,body[data-theme] *::after { animation-duration:0.01ms!important; transition-duration:0.01ms!important; } }
    `;
    document.head.appendChild(style);
  }
  function applyPreferences(prefs) {
    if (!document.body) return false;
    ensureAppearanceStyles();
    const p = normalise(prefs), c = PALETTES[p.theme];
    const names = ['--cornhill-accent','--cornhill-accent-dark','--cornhill-page','--cornhill-panel','--cornhill-ink','--cornhill-muted','--cornhill-line'];
    names.forEach((name, index) => document.body.style.setProperty(name, c[index]));
    const aliases = {
      '--accent':c[0], '--accent-dark':c[1], '--page':c[2], '--panel':c[3],
      '--ink':c[4], '--text':c[4], '--muted':c[5], '--mute':c[5], '--line':c[6],
      '--surface':c[3], '--surface-alt':c[2]
    };
    Object.keys(aliases).forEach(name => document.body.style.setProperty(name, aliases[name]));
    document.body.dataset.theme = p.theme;
    document.body.dataset.motion = p.motion;
    document.body.dataset.density = p.density;
    document.body.dataset.dashboardLayout = p.dashboardLayout;
    document.body.dataset.navigationLayout = p.navigationLayout;
    document.documentElement.style.fontFamily = FONTS[p.font];
    document.documentElement.style.fontSize = p.fontSize + 'px';
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', c[1]);
    return true;
  }
  function saveForUser(userId, changes) {
    if (typeof userId !== 'string' || !userId.trim()) return false;
    const next = normalise(Object.assign({}, getForUser(userId), changes || {}));
    try { localStorage.setItem(keyFor(userId), JSON.stringify(next)); }
    catch (_) { applyPreferences(next); return false; }
    if (ACTIVE_USER_ID === userId) applyPreferences(next);
    window.dispatchEvent(new CustomEvent('cornhill:appearance-changed', { detail: { userId, preferences: next } }));
    return true;
  }
  function option(select, value, label) {
    const node = document.createElement('option');
    node.value = value; node.textContent = label; select.appendChild(node);
  }
  function mountSettings(userId) {
    if (!document.body || typeof userId !== 'string' || !userId.trim()) return false;
    const existing = document.getElementById('cornhillAppearancePanel');
    if (existing) {
      existing.dataset.userId = userId;
      syncPanel(userId);
      return true;
    }
    const style = document.createElement('style');
    style.id = 'cornhillAppearancePanelStyles';
    style.textContent =
      '#cornhillAppearanceLauncher{position:fixed;right:14px;bottom:14px;z-index:12000;border:0;border-radius:999px;padding:12px 16px;background:var(--cornhill-accent,#166534);color:#fff;font:700 13px system-ui;box-shadow:0 8px 28px #102b1b35}' +
      '#cornhillAppearancePanel{position:fixed;right:14px;bottom:66px;z-index:12001;width:min(360px,calc(100vw - 28px));max-height:min(72vh,620px);overflow:auto;padding:16px;border:1px solid var(--cornhill-line,#dce7de);border-radius:16px;background:var(--cornhill-panel,#fff);color:var(--cornhill-ink,#17251c);box-shadow:0 16px 48px #102b1b35;font:14px system-ui}' +
      '#cornhillAppearancePanel[hidden]{display:none!important}#cornhillAppearancePanel h2{font-size:17px;margin:0}#cornhillAppearancePanel .ca-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}' +
      '#cornhillAppearancePanel label{display:block;margin:10px 0 4px;font-size:12px;font-weight:700;color:var(--cornhill-ink,#17251c)}' +
      '#cornhillAppearancePanel select{display:block;width:100%;min-height:40px;margin:0;padding:8px;border:1px solid var(--cornhill-line,#dce7de);border-radius:9px;background:var(--cornhill-panel,#fff);color:var(--cornhill-ink,#17251c);font:inherit}' +
      '#cornhillAppearancePanel .ca-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}#cornhillAppearancePanel .ca-wide{grid-column:1/-1}' +
      '#cornhillAppearancePanel .ca-close{border:0;background:transparent;color:var(--cornhill-ink,#17251c);font-size:22px;padding:2px 8px;cursor:pointer}' +
      '#cornhillAppearancePanel .ca-status{font-size:11px;color:var(--cornhill-muted,#607265);margin:12px 0 0;line-height:1.45}' +
      '@media(max-width:420px){#cornhillAppearancePanel{right:8px;bottom:62px;width:calc(100vw - 16px)}#cornhillAppearanceLauncher{right:8px;bottom:8px}}';
    document.head.appendChild(style);
    const launcher = document.createElement('button');
    launcher.type = 'button'; launcher.id = 'cornhillAppearanceLauncher';
    launcher.textContent = 'Appearance'; launcher.setAttribute('aria-expanded','false');
    launcher.setAttribute('aria-controls','cornhillAppearancePanel');
    const panel = document.createElement('section');
    panel.id = 'cornhillAppearancePanel'; panel.hidden = true; panel.setAttribute('role','dialog');
    panel.setAttribute('aria-label','Appearance settings'); panel.dataset.userId = userId;
    const head = document.createElement('div'); head.className = 'ca-head';
    const title = document.createElement('h2'); title.textContent = 'Appearance settings';
    const close = document.createElement('button'); close.type = 'button'; close.className = 'ca-close'; close.textContent = '×'; close.setAttribute('aria-label','Close appearance settings');
    head.append(title, close); panel.appendChild(head);
    const grid = document.createElement('div'); grid.className = 'ca-grid';
    const fields = [
      {id:'caTheme',label:'Colour theme',wide:true,items:Object.keys(PALETTES).map(k=>[k,THEME_LABELS[k]])},
      {id:'caFont',label:'Font style',wide:true,items:Object.keys(FONTS).map(k=>[k,FONT_LABELS[k]])},
      {id:'caFontSize',label:'Text size',items:[['14','Compact'],['16','Standard'],['18','Large'],['20','Extra large']]},
      {id:'caDensity',label:'Spacing',items:[['comfortable','Comfortable'],['compact','Compact']]},
      {id:'caMotion',label:'Motion',items:[['off','Reduced motion'],['on','Subtle motion']]},
      {id:'caLayout',label:'Main dashboard layout',wide:true,items:LAYOUTS},
      {id:'caNavigationLayout',label:'Navigation layout',wide:true,items:[['left','Left sidebar'],['top','Top navigation'],['right','Right sidebar'],['rail','Icon rail']]}
    ];
    fields.forEach(field => {
      const wrap = document.createElement('div'); if (field.wide) wrap.className = 'ca-wide';
      const label = document.createElement('label'); label.htmlFor = field.id; label.textContent = field.label;
      const select = document.createElement('select'); select.id = field.id;
      field.items.forEach(item => option(select,item[0],item[1]));
      select.addEventListener('change', () => {
        const activeId = panel.dataset.userId;
        const map = {caTheme:'theme',caFont:'font',caFontSize:'fontSize',caDensity:'density',caMotion:'motion',caLayout:'dashboardLayout',caNavigationLayout:'navigationLayout'};
        const changed = {}; changed[map[select.id]] = select.value;
        const saved = saveForUser(activeId, changed);
        status.textContent = saved ? 'Saved on this device. The same staff account will use this appearance in the other CORNHILL staff apps on this browser.' : 'The appearance changed for this page, but browser storage is unavailable. It may not persist after closing the page.';
        syncPanel(activeId);
      });
      wrap.append(label,select); grid.appendChild(wrap);
    });
    const status = document.createElement('p'); status.id = 'caAppearanceStatus'; status.className = 'ca-status';
    status.textContent = 'Preferences are stored locally for your signed-in staff account. Dashboard layout is used on the main school dashboard.';
    panel.append(grid,status);
    document.body.append(launcher,panel);
    const closePanel = () => { panel.hidden = true; launcher.setAttribute('aria-expanded','false'); };
    launcher.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      launcher.setAttribute('aria-expanded',String(!panel.hidden));
    });
    close.addEventListener('click',closePanel);
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) closePanel(); });
    syncPanel(userId);
    return true;
  }
  function syncPanel(userId) {
    const panel = document.getElementById('cornhillAppearancePanel');
    if (!panel) return;
    panel.dataset.userId = userId;
    const p = getForUser(userId);
    const values = {caTheme:p.theme,caFont:p.font,caFontSize:p.fontSize,caDensity:p.density,caMotion:p.motion,caLayout:p.dashboardLayout,caNavigationLayout:p.navigationLayout};
    Object.keys(values).forEach(id => { const el = document.getElementById(id); if (el) el.value = values[id]; });
  }
  function applyForUser(userId, options) {
    if (typeof userId !== 'string' || !userId.trim() || !document.body) return false;
    ACTIVE_USER_ID = userId;
    const prefs = getForUser(userId);
    applyPreferences(prefs);
    if (!options || options.mount !== false) mountSettings(userId);
    return true;
  }
  window.addEventListener('storage', event => {
    const userId = ACTIVE_USER_ID;
    if (!userId || keyFor(userId) !== event.key) return;
    applyPreferences(getForUser(userId));
    syncPanel(userId);
  });
  window.CornhillAppearance = Object.freeze({
    getForUser, saveForUser, applyForUser, applyPreferences, mountSettings,
    themeCount:Object.keys(PALETTES).length, fontCount:Object.keys(FONTS).length,
    layoutCount:LAYOUTS.length
  });
})();