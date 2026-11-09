/* CORNHILL offline-first client foundation.
   Caches only encrypted local drafts and explicitly queued business actions.
   It never caches auth tokens, uploads, bank receipts or authoritative server data. */
(function () {
  'use strict';
  if (window.CornhillOffline) return;

  const DB_NAME = 'cornhill-offline-v1';
  const DB_VERSION = 1;
  const DB_STORES = ['keys', 'drafts', 'outbox'];
  const handlers = new Map();
  let identity = null;
  let dbPromise = null;
  let syncPromise = null;
  let indicator = null;
  const draftTimers = new WeakMap();
  const wiredForms = new WeakSet();

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        DB_STORES.forEach(name => {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id' });
          }
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Offline storage is unavailable.'));
    });
    return dbPromise;
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Offline storage request failed.'));
    });
  }

  async function storeGet(storeName, id) {
    const db = await openDb();
    return requestResult(db.transaction(storeName, 'readonly').objectStore(storeName).get(id));
  }

  async function storePut(storeName, value) {
    const db = await openDb();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error || new Error('Offline save failed.'));
      tx.onabort = () => reject(tx.error || new Error('Offline save was interrupted.'));
    });
  }

  async function storeDelete(storeName, id) {
    const db = await openDb();
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Offline delete failed.'));
      tx.onabort = () => reject(tx.error || new Error('Offline delete was interrupted.'));
    });
  }

  async function storeAll(storeName) {
    const db = await openDb();
    return requestResult(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
  }

  async function getDeviceKey() {
    const saved = await storeGet('keys', 'device-aes-gcm-v1');
    if (saved && saved.key) return saved.key;
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
    await storePut('keys', { id: 'device-aes-gcm-v1', key });
    return key;
  }

  async function seal(value) {
    if (!crypto || !crypto.subtle) throw new Error('Encrypted offline storage is not supported on this device.');
    const key = await getDeviceKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
    return { iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(encrypted)) };
  }

  async function unseal(record) {
    const key = await getDeviceKey();
    const bytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(record.iv) },
      key,
      new Uint8Array(record.ciphertext)
    );
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function guestScope() {
    try {
      let value = sessionStorage.getItem('cornhill-offline-guest-scope');
      if (!value) {
        value = 'guest-' + crypto.randomUUID();
        sessionStorage.setItem('cornhill-offline-guest-scope', value);
      }
      return value;
    } catch (_) {
      return 'guest-current-tab';
    }
  }

  function currentScope() {
    return identity ? 'user-' + identity : guestScope();
  }

  function formKey(form, index) {
    if (!form.dataset.cornhillOfflineKey) {
      const id = form.id || ('form-' + index);
      form.dataset.cornhillOfflineKey = location.pathname + '::' + id;
    }
    return form.dataset.cornhillOfflineKey;
  }

  function eligibleForm(form) {
    if (!(form instanceof HTMLFormElement)) return false;
    if (form.dataset.offlineDraft === 'false') return false;
    if (/login|sign.?in|reset.?pin|password|auth/i.test(form.id || '')) return false;
    if (form.querySelector('input[type="password"],input[autocomplete="one-time-code"]')) return false;
    return true;
  }

  function fieldsFrom(form) {
    const fields = [];
    for (const el of Array.from(form.elements || [])) {
      if (!el || el.disabled || !el.name && !el.id) continue;
      if (['password', 'file', 'hidden', 'submit', 'button', 'reset'].includes((el.type || '').toLowerCase())) continue;
      if (/password|pin|otp|token|secret|recovery|credential/i.test((el.name || '') + ' ' + (el.id || ''))) continue;
      const key = el.name || el.id;
      if (el.type === 'checkbox' || el.type === 'radio') {
        fields.push({ key, type: el.type, checked: !!el.checked, value: el.value });
      } else if (el.tagName === 'SELECT' && el.multiple) {
        fields.push({ key, type: 'select-multiple', value: Array.from(el.selectedOptions).map(x => x.value) });
      } else {
        fields.push({ key, type: 'value', value: el.value });
      }
    }
    return fields;
  }

  async function saveFormDraft(form) {
    if (!eligibleForm(form)) return;
    const fields = fieldsFrom(form);
    if (!fields.length) return;
    const id = currentScope() + '::' + formKey(form, Array.from(document.forms).indexOf(form));
    const encrypted = await seal({ fields, savedAt: new Date().toISOString() });
    await storePut('drafts', {
      id, scope: currentScope(), path: location.pathname,
      formKey: formKey(form, Array.from(document.forms).indexOf(form)),
      updatedAt: Date.now(), ...encrypted
    });
    updateIndicator();
    window.dispatchEvent(new CustomEvent('cornhill:offline:draft-saved', { detail: { formKey: formKey(form) } }));
  }

  async function restoreFormDraft(form, index) {
    if (!eligibleForm(form)) return;
    const id = currentScope() + '::' + formKey(form, index);
    const record = await storeGet('drafts', id);
    if (!record) return;
    const decoded = await unseal(record);
    let restored = 0;
    for (const field of decoded.fields || []) {
      const candidates = Array.from(form.elements || []).filter(el => (el.name || el.id) === field.key);
      for (const el of candidates) {
        if (el.disabled || ['password', 'file', 'hidden'].includes((el.type || '').toLowerCase())) continue;
        if (field.type === 'checkbox' || field.type === 'radio') {
          if (el.value === field.value) { el.checked = !!field.checked; restored++; }
        } else if (field.type === 'select-multiple') {
          const selected = new Set(field.value || []);
          Array.from(el.options || []).forEach(option => { option.selected = selected.has(option.value); });
          restored++;
        } else if (field.type === 'value' && !String(el.value || '').trim()) {
          el.value = field.value == null ? '' : String(field.value);
          restored++;
        }
      }
    }
    if (restored) {
      window.dispatchEvent(new CustomEvent('cornhill:offline:draft-restored', {
        detail: { formKey: record.formKey, fields: restored }
      }));
      updateIndicator();
    }
  }

  async function clearFormDraft(form) {
    if (!eligibleForm(form)) return;
    const id = currentScope() + '::' + formKey(form, Array.from(document.forms).indexOf(form));
    await storeDelete('drafts', id);
    updateIndicator();
  }

  function wireForms() {
    Array.from(document.forms).forEach((form, index) => {
      if (!eligibleForm(form) || wiredForms.has(form)) return;
      wiredForms.add(form);
      formKey(form, index);
      restoreFormDraft(form, index).catch(() => {});
      const save = () => {
        clearTimeout(draftTimers.get(form));
        draftTimers.set(form, setTimeout(() => saveFormDraft(form).catch(() => {}), 350));
      };
      form.addEventListener('input', save);
      form.addEventListener('change', save);
      form.addEventListener('reset', () => {
        setTimeout(() => clearFormDraft(form).catch(() => {}), 0);
      });
    });
  }

  async function countPending() {
    const records = await storeAll('outbox');
    return records.filter(x => x.status !== 'synced').length;
  }

  function paintIndicator(state, pending, savedDrafts) {
    if (!indicator) return;
    const offline = !navigator.onLine;
    indicator.dataset.state = offline ? 'offline' : pending ? 'pending' : 'online';
    const title = offline
      ? 'Offline · drafts stay on this device'
      : pending
        ? 'Connected · ' + pending + ' item(s) waiting to sync'
        : 'Connected · ready';
    indicator.querySelector('[data-label]').textContent = title;
    indicator.querySelector('[data-drafts]').textContent = savedDrafts ? savedDrafts + ' local draft(s)' : '';
    indicator.querySelector('[data-sync]').disabled = offline || !pending;
    indicator.querySelector('[data-sync]').textContent = state === 'syncing' ? 'Syncing…' : 'Sync now';
  }

  async function updateIndicator(state) {
    if (!indicator) return;
    try {
      const [pending, drafts] = await Promise.all([countPending(), storeAll('drafts')]);
      const scoped = drafts.filter(x => x.scope === currentScope()).length;
      paintIndicator(state, pending, scoped);
    } catch (_) {
      paintIndicator(state, 0, 0);
    }
  }

  function mountIndicator() {
    if (indicator || !document.body) return;
    const style = document.createElement('style');
    style.textContent = `
      #cornhillOfflineIndicator{position:fixed;z-index:99999;right:12px;bottom:12px;display:flex;align-items:center;gap:9px;max-width:min(94vw,440px);padding:9px 12px;border:1px solid #d7e3d9;border-radius:999px;background:#fff;color:#173d27;box-shadow:0 5px 24px #102b1a20;font:700 11px/1.25 system-ui,sans-serif}
      #cornhillOfflineIndicator[data-state="offline"]{background:#fff8e8;border-color:#e8d19c;color:#704c0b}
      #cornhillOfflineIndicator [data-drafts]{font-weight:500;color:#657568}
      #cornhillOfflineIndicator button{border:0;border-radius:999px;padding:6px 10px;background:#14532d;color:#fff;font:700 11px system-ui,sans-serif;cursor:pointer}
      #cornhillOfflineIndicator button:disabled{opacity:.45;cursor:default}
      @media(max-width:560px){#cornhillOfflineIndicator{left:8px;right:8px;bottom:8px;justify-content:space-between;max-width:none}#cornhillOfflineIndicator [data-drafts]{display:none}}
    `;
    document.head.appendChild(style);
    indicator = document.createElement('div');
    indicator.id = 'cornhillOfflineIndicator';
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');
    indicator.innerHTML = '<span data-label>Checking connection…</span><span data-drafts></span><button type="button" data-sync>Sync now</button>';
    document.body.appendChild(indicator);
    indicator.querySelector('[data-sync]').addEventListener('click', () => syncNow().catch(() => {}));
    updateIndicator();
  }

  async function enqueue(type, payload, userId, itemId) {
    if (!type || typeof type !== 'string') throw new Error('An offline action type is required.');
    const id = itemId || (payload && payload.id) || crypto.randomUUID();
    const encrypted = await seal(payload);
    await storePut('outbox', {
      id, type, userId: userId || null, status: 'pending',
      createdAt: Date.now(), attempts: 0, ...encrypted
    });
    updateIndicator();
    window.dispatchEvent(new CustomEvent('cornhill:offline:queued', { detail: { id, type } }));
    if (navigator.onLine) syncNow().catch(() => {});
    return { id, queued: true };
  }

  function registerSyncHandler(type, handler) {
    if (!type || typeof handler !== 'function') throw new Error('A valid offline sync handler is required.');
    handlers.set(type, handler);
    if (navigator.onLine) syncNow().catch(() => {});
  }

  async function syncNow() {
    if (!navigator.onLine) return { synced: 0, pending: await countPending() };
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
      let synced = 0;
      const records = (await storeAll('outbox')).sort((a, b) => a.createdAt - b.createdAt);
      await updateIndicator('syncing');
      for (const record of records) {
        const handler = handlers.get(record.type);
        if (!handler || (record.userId && identity !== record.userId)) continue;
        try {
          const payload = await unseal(record);
          await handler({ id: record.id, type: record.type, userId: record.userId, payload });
          await storeDelete('outbox', record.id);
          synced++;
          window.dispatchEvent(new CustomEvent('cornhill:offline:item-synced', {
            detail: { id: record.id, type: record.type, userId: record.userId }
          }));
        } catch (error) {
          const next = {
            ...record, status: error && error.code === 'AUTH_REQUIRED' ? 'waiting-sign-in' : 'pending',
            attempts: (record.attempts || 0) + 1,
            lastAttemptAt: Date.now(),
            lastError: String(error && error.message || 'Sync failed').slice(0, 240)
          };
          await storePut('outbox', next);
          window.dispatchEvent(new CustomEvent('cornhill:offline:sync-error', {
            detail: { id: record.id, type: record.type, code: error && error.code || 'SYNC_ERROR' }
          }));
        }
      }
      await updateIndicator();
      return { synced, pending: await countPending() };
    })().finally(() => { syncPromise = null; });
    return syncPromise;
  }

  async function setIdentity(userId) {
    const nextIdentity = userId || null;
    const changed = nextIdentity !== identity;
    identity = nextIdentity;
    if (document.body) {
      wireForms();
      if (changed) Array.from(document.forms).forEach((form, index) => restoreFormDraft(form, index).catch(() => {}));
      updateIndicator();
    }
    if (navigator.onLine) syncNow().catch(() => {});
  }

  function hookSupabaseAuth() {
    const api = window.supabase;
    if (!api || typeof api.createClient !== 'function' || api.createClient.__cornhillOfflineHooked) return;
    const original = api.createClient.bind(api);
    const wrapped = function () {
      const client = original.apply(null, arguments);
      try {
        client.auth.onAuthStateChange((_event, session) => setIdentity(session && session.user ? session.user.id : null));
        client.auth.getSession().then(({ data }) => setIdentity(data && data.session && data.session.user ? data.session.user.id : null)).catch(() => {});
      } catch (_) {}
      return client;
    };
    wrapped.__cornhillOfflineHooked = true;
    api.createClient = wrapped;
  }

  function boot() {
    mountIndicator();
    wireForms();
    hookSupabaseAuth();
    if (window.MutationObserver && document.body) {
      const observer = new MutationObserver(() => wireForms());
      observer.observe(document.body, { childList: true, subtree: true });
    }
    window.addEventListener('online', () => { updateIndicator('syncing'); syncNow().catch(() => {}); });
    window.addEventListener('offline', () => updateIndicator());
    window.addEventListener('pageshow', () => { hookSupabaseAuth(); updateIndicator(); });
    updateIndicator();
  }

  // Hook immediately: page inline scripts may create their Supabase client before DOMContentLoaded.
  hookSupabaseAuth();

  const api = Object.freeze({
    enqueue,
    registerSyncHandler,
    syncNow,
    setIdentity,
    pendingCount: countPending
  });
  window.CornhillOffline = api;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();