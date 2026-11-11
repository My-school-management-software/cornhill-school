'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function createIndexedDb() {
  const stores = new Map();
  const db = {
    objectStoreNames: { contains: name => stores.has(name) },
    createObjectStore(name) {
      const store = new Map();
      stores.set(name, store);
      return store;
    },
    transaction(name) {
      const store = stores.get(name);
      if (!store) throw new Error('Missing fake store: ' + name);
      return {
        objectStore() {
          return {
            get(key) {
              const request = {};
              queueMicrotask(() => {
                request.result = store.get(key);
                request.onsuccess?.();
              });
              return request;
            },
            add(value) {
              const request = {};
              queueMicrotask(() => {
                if (store.has(value.id)) {
                  request.error = new Error('ConstraintError');
                  request.onerror?.();
                } else {
                  store.set(value.id, value);
                  request.result = value.id;
                  request.onsuccess?.();
                }
              });
              return request;
            }
          };
        }
      };
    }
  };
  const indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = db;
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }
  };
  return { indexedDB, stores };
}

async function loadCryptoHelper() {
  const fake = createIndexedDb();
  const window = { indexedDB: fake.indexedDB, crypto: webcrypto };
  const source = fs.readFileSync(path.join(__dirname, '../assets/cornhill-draft-crypto.js'), 'utf8');
  vm.runInNewContext(source, {
    window, TextEncoder, TextDecoder, Uint8Array, Array, JSON, Object, String, Promise, Error
  }, { filename: 'cornhill-draft-crypto.js' });
  return { api: window.CornhillDraftCrypto, fake };
}

test('AES-GCM offline drafts round-trip and keep content encrypted', async () => {
  const { api } = await loadCryptoHelper();
  const original = { pupil: 'TEST-PUPIL-DO-NOT-STORE', mark: 77, comment: 'test value' };
  const sealed = await api.seal(original, 'user-1|assessment-1');
  assert.equal(sealed.version, 1);
  assert.equal(sealed.algorithm, 'AES-GCM');
  assert.equal(JSON.stringify(sealed).includes(original.pupil), false);
  assert.equal(JSON.stringify(sealed).includes('"mark":77'), false);
  assert.deepEqual(await api.open(sealed, 'user-1|assessment-1'), original);
});

test('encrypted drafts cannot be moved across user or record scopes', async () => {
  const { api } = await loadCryptoHelper();
  const sealed = await api.seal({ amount: 12000 }, 'user-1|fee-draft');
  await assert.rejects(api.open(sealed, 'user-2|fee-draft'));
  await assert.rejects(api.open(sealed, 'user-1|different-record'));
});

test('modified ciphertext is rejected by authenticated encryption', async () => {
  const { api } = await loadCryptoHelper();
  const sealed = await api.seal({ score: 81 }, 'score|id-1');
  const tampered = { ...sealed, ciphertext: sealed.ciphertext.slice() };
  tampered.ciphertext[tampered.ciphertext.length - 1] ^= 1;
  await assert.rejects(api.open(tampered, 'score|id-1'));
});

test('offline AES key is non-exportable and persisted once for the device', async () => {
  const { api, fake } = await loadCryptoHelper();
  const first = await api.seal({ value: 1 }, 'scope');
  const second = await api.seal({ value: 2 }, 'scope');
  assert.equal(fake.stores.get('keys').size, 1);
  assert.equal((await api.open(second, 'scope')).value, 2);
  assert.ok(first.ciphertext.length > 0);
});

test('main dashboard routes forms, class snapshots and mark drafts through encryption', () => {
  const index = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.match(index, /<script src="\/assets\/cornhill-draft-crypto\.js"><\/script>/);
  assert.ok(index.includes('<script src="/assets/cornhill-offline.js"></script>'));
  assert.ok(index.indexOf("/assets/cornhill-offline.js") < index.indexOf("</head>"));
  assert.ok(index.indexOf("/assets/cornhill-draft-crypto.js") < index.indexOf("</head>"));
  assert.match(index, /CornhillDraftCrypto\.seal\(\{values,updated_at:updatedAt\},draftId\)/);
  assert.match(index, /CornhillDraftCrypto\.open\(draft\.payload,owner\+'\|'\+key\)/);
  assert.match(index, /CornhillDraftCrypto\.seal\(snapshot,'classSnapshot\|'\+owner\)/);
  assert.match(index, /CornhillDraftCrypto\.open\(stored\.payload,'classSnapshot\|'\+owner\)/);
  assert.match(index, /CornhillDraftCrypto\.seal\(draft,'assessmentDraft\|'\+draft\.draft_id\)/);
  assert.match(index, /CornhillDraftCrypto\.open\(row\.payload,'assessmentDraft\|'\+row\.draft_id\)/);
  assert.match(index, /async function autosaveExcelMarkCell\(input\)/);
  assert.match(index, /\$\('excelMarksBody'\)\.addEventListener\('input'/);
});

test('offline service worker refreshes its cache and preloads the encryption helper', () => {
  const sw = fs.readFileSync(path.join(__dirname, '../service-worker.js'), 'utf8');
  assert.match(sw, /cornhill-shell-v91/);
  assert.match(sw, /cornhill-static-v91/);
  assert.match(sw, /\/assets\/cornhill-draft-crypto\.js/);
});
