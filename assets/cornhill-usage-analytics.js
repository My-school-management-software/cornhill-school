/* CORNHILL first-party usage analytics.
   No raw URL/query strings, IP addresses, user-agent strings, names, phone numbers,
   learner IDs, messages, marks, or free-text form contents are collected.
   Collection is optional and requires an explicit device/account preference. */
(function () {
  'use strict';
  if (window.CornhillUsageAnalytics) return;

  const API = 'https://yemhortbudwbcrzsoozk.supabase.co/functions/v1/usage-analytics';
  const PUBLISHABLE_KEY = 'sb_publishable_jmw4qoKOkV2ga9GiZ5n1sg_dQoHnE97';
  const CONSENT_KEY = 'cornhill_usage_analytics_consent_v1';
  const VISITOR_KEY = 'cornhill_usage_visitor_v1';
  const SESSION_KEY = 'cornhill_usage_session_v1';
  const DAY_MS = 86400000;
  let fallbackVisitor = null;
  let fallbackSession = null;

  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else return String(Date.now()) + '-' + String(Math.random()).slice(2);
    return Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
  }
  function storageId(storage, key, persistent) {
    try {
      const saved = storage.getItem(key);
      if (saved) {
        if (!persistent) return saved;
        const parsed = JSON.parse(saved);
        if (parsed && parsed.id && parsed.expires_at > Date.now()) return parsed.id;
      }
      const id = randomId();
      if (persistent) storage.setItem(key, JSON.stringify({ id, expires_at: Date.now() + 90 * DAY_MS }));
      else storage.setItem(key, id);
      return id;
    } catch (_) {
      if (persistent) return fallbackVisitor || (fallbackVisitor = randomId());
      return fallbackSession || (fallbackSession = randomId());
    }
  }
  function consent() {
    try { return localStorage.getItem(CONSENT_KEY) === 'allow'; } catch (_) { return false; }
  }
  function currentPathWorkspace() {
    const host = String(location.hostname || '').toLowerCase();
    const path = String(location.pathname || '/').toLowerCase();
    if (host.includes('admissions') || path.includes('admissions')) return 'admissions';
    if (host.includes('parent') || path.includes('parents') || path.includes('parent-guardian')) return 'parent_portal';
    if (host.includes('hr-payroll') || path.includes('/hr-payroll')) return 'hr_payroll';
    if (host.includes('school-library') || path.includes('/school-library')) return 'library';
    if (host.includes('learning-resources') || path.includes('/learning-resources')) return 'learning';
    if (host.includes('school-transport') || path.includes('/school-transport')) return 'transport';
    if (host.includes('student-welfare') || path.includes('/student-welfare')) return 'welfare';
    if (host.includes('banking') || path.includes('/banking')) return 'banking';
    if (host.includes('evidence') || path.includes('/evidence')) return 'evidence';
    if (host.includes('records') || path.includes('/records')) return 'records';
    if (host.includes('notifications') || path.includes('/notifications')) return 'notifications';
    if (host.includes('system-health') || path.includes('/system-health')) return 'system_health';
    if (host.includes('noticeboard') || path.includes('/notice-board')) return 'noticeboard';
    if (host.includes('school-calendar') || path.includes('/school-calendar')) return 'calendar';
    if (host.includes('visitor-register') || path.includes('/visitor-register')) return 'visitor_register';
    if (host.includes('asset-maintenance') || path.includes('/asset-maintenance')) return 'asset_maintenance';
    if (host.includes('school-website') || path === '/school.html') return 'school_website';
    if (path === '/admissions.html') return 'admissions';
    if (path === '/parents.html') return 'parent_portal';
    if (path === '/school-services.html') return 'staff_services';
    if (path === '/banking.html') return 'banking';
    if (path === '/evidence.html') return 'evidence';
    if (path === '/records.html') return 'records';
    if (path === '/notifications.html') return 'notifications';
    if (path === '/' || path === '/index.html' || path.startsWith('/apps/school-management')) return 'main_dashboard';
    return 'other';
  }
  function deviceClass() {
    const ua = String(navigator.userAgent || '');
    if (/ipad|tablet|playbook|silk/i.test(ua)) return 'tablet';
    if (/mobile|android|iphone|ipod|windows phone/i.test(ua)) return 'mobile';
    if (Math.min(window.screen?.width || window.innerWidth || 1200, window.screen?.height || window.innerHeight || 800) < 700) return 'mobile';
    return 'desktop';
  }
  function readStaffAccessToken() {
    const stores = [];
    try { stores.push(localStorage); } catch (_) {}
    try { stores.push(sessionStorage); } catch (_) {}
    for (const store of stores) {
      try {
        for (let i = 0; i < store.length; i += 1) {
          const key = store.key(i) || '';
          if (!/auth|supabase|session|cornhill-services-tab/i.test(key)) continue;
          const value = store.getItem(key);
          if (!value) continue;
          let parsed;
          try { parsed = JSON.parse(value); } catch (_) { continue; }
          const candidates = [parsed, parsed?.currentSession, parsed?.session, parsed?.data?.session];
          for (const item of candidates) {
            const token = item?.access_token;
            if (typeof token === 'string' && token.split('.').length === 3) return token;
          }
        }
      } catch (_) {}
    }
    return '';
  }
  async function send(eventType, workspace, token) {
    if (!consent()) return false;
    const headers = { 'Content-Type': 'application/json', 'apikey': PUBLISHABLE_KEY };
    if (token) headers.Authorization = 'Bearer ' + token;
    const body = {
      action: 'track',
      event_type: eventType,
      workspace: workspace || currentPathWorkspace(),
      device_class: deviceClass(),
      visitor_id: storageId(localStorage, VISITOR_KEY, true),
      session_id: storageId(sessionStorage, SESSION_KEY, false)
    };
    try {
      const response = await fetch(API, { method: 'POST', headers, body: JSON.stringify(body), keepalive: true });
      return response.ok;
    } catch (_) { return false; }
  }
  function getCurrentStaffToken() { return readStaffAccessToken(); }

  function injectConsentBanner() {
    if (!document.body || document.getElementById('cornhillUsageConsentBanner')) return;
    const banner = document.createElement('aside');
    banner.id = 'cornhillUsageConsentBanner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Optional usage statistics');
    banner.style.cssText = 'position:fixed;z-index:99999;left:12px;right:12px;bottom:12px;max-width:760px;margin:0 auto;background:#fff;border:1px solid #cbded0;border-radius:14px;box-shadow:0 10px 34px rgba(0,0,0,.18);padding:14px;color:#173f29;font:14px/1.45 system-ui,sans-serif';
    banner.innerHTML = '<strong>Help improve CORNHILL online services</strong>' +
      '<p style="margin:6px 0 10px">Optional usage statistics count pages and workspaces visited and broad device type. The school does not collect learner identity, marks, messages, phone numbers, IP addresses or the text entered in forms for these statistics. Consenting statistics are kept for up to 90 days. You may choose not to participate.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<button type="button" data-usage-consent="allow" style="border:0;border-radius:8px;background:#14532d;color:#fff;padding:9px 13px;font-weight:700">Allow basic statistics</button>' +
      '<button type="button" data-usage-consent="deny" style="border:1px solid #9eb7a5;border-radius:8px;background:#fff;color:#214a30;padding:9px 13px">Not now</button>' +
      '<button type="button" data-usage-consent="close" style="border:0;background:transparent;color:#52685a;padding:7px">Decide later</button>' +
      '</div>';
    document.body.appendChild(banner);
    banner.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-usage-consent]');
      if (!button) return;
      const choice = button.dataset.usageConsent;
      if (choice === 'close') { banner.remove(); return; }
      try { localStorage.setItem(CONSENT_KEY, choice === 'allow' ? 'allow' : 'deny'); } catch (_) {}
      banner.remove();
      if (choice === 'allow') await send('page_view', currentPathWorkspace(), getCurrentStaffToken());
    });
  }
  function addPreferenceLink() {
    if (!document.body || document.getElementById('cornhillUsagePreferenceLink')) return;
    const link = document.createElement('button');
    link.id = 'cornhillUsagePreferenceLink';
    link.type = 'button';
    link.textContent = 'Usage statistics settings';
    link.style.cssText = 'position:fixed;z-index:99990;right:10px;bottom:8px;border:0;border-radius:7px;background:rgba(20,83,45,.9);color:#fff;padding:6px 9px;font:11px system-ui,sans-serif;opacity:.82';
    link.addEventListener('click', () => {
      const banner = document.getElementById('cornhillUsageConsentBanner');
      if (banner) banner.remove();
      try { localStorage.removeItem(CONSENT_KEY); } catch (_) {}
      injectConsentBanner();
    });
    document.body.appendChild(link);
  }
  function installAdmissionsEvents() {
    const form = document.getElementById('admissionForm');
    if (!form || form.dataset.usageAnalyticsBound === '1') return;
    form.dataset.usageAnalyticsBound = '1';
    let started = false;
    form.addEventListener('focusin', () => {
      if (started) return;
      started = true;
      send('admissions_form_started', 'admissions', getCurrentStaffToken());
    }, { once: true });
    form.addEventListener('submit', () => {
      send('admissions_form_submitted', 'admissions', getCurrentStaffToken());
    }, true);
    const status = document.getElementById('formMsg');
    if (status && typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(() => {
        const text = String(status.textContent || '');
        if (text.includes('Your admission enquiry has been received.')) {
          send('admissions_form_accepted', 'admissions', getCurrentStaffToken());
        } else if (text.includes('The enquiry was not submitted.') || text.includes('could not be submitted.')) {
          send('admissions_form_error', 'admissions', getCurrentStaffToken());
        }
      });
      observer.observe(status, { childList: true, subtree: true, characterData: true });
    }
    window.addEventListener('cornhill:offline:item-synced', (event) => {
      if (event.detail?.type === 'admission_enquiry') send('admissions_form_accepted', 'admissions', getCurrentStaffToken());
    });
  }

  const api = {
    track(eventType, workspace) { return send(eventType, workspace || currentPathWorkspace(), getCurrentStaffToken()); },
    trackParentSession(token, eventType = 'parent_login_success') {
      if (!/^[a-f0-9]{64}$/.test(String(token || ''))) return Promise.resolve(false);
      return send(eventType, 'parent_portal', String(token));
    },
    getReport(startDate, endDate) {
      const token = getCurrentStaffToken();
      if (!token) return Promise.reject(new Error('Director sign-in could not be verified on this device.'));
      const headers = { 'Content-Type': 'application/json', 'apikey': PUBLISHABLE_KEY, 'Authorization': 'Bearer ' + token };
      return fetch(API, { method: 'POST', headers, body: JSON.stringify({ action: 'report', start_date: startDate, end_date: endDate }) })
        .then(async response => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || 'Usage report could not be loaded.');
          return data.report;
        });
    },
    setConsent(allow) {
      try { localStorage.setItem(CONSENT_KEY, allow ? 'allow' : 'deny'); } catch (_) {}
      if (allow) return send('page_view', currentPathWorkspace(), getCurrentStaffToken());
      return Promise.resolve(true);
    },
    getConsent() { return consent(); }
  };
  window.CornhillUsageAnalytics = api;

  function initialise() {
    injectConsentBanner();
    addPreferenceLink();
    installAdmissionsEvents();
    if (consent()) send('page_view', currentPathWorkspace(), getCurrentStaffToken());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
  else initialise();
})();
