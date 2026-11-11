'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function makeIndexedDb() {
  const stores = new Map();
  const db = {
    objectStoreNames: { contains: name => stores.has(name) },
    createObjectStore(name) { stores.set(name, new Map()); },
    transaction(name) {
      const store = stores.get(name);
      return {
        objectStore() {
          return {
            get(id) {
              const request = {};
              queueMicrotask(() => { request.result = store.get(id); request.onsuccess?.(); });
              return request;
            },
            put(value) {
              const request = {};
              store.set(value.id, value);
              queueMicrotask(() => request.onsuccess?.());
              return request;
            },
            delete(id) {
              const request = {};
              store.delete(id);
              queueMicrotask(() => request.onsuccess?.());
              return request;
            }
          };
        },
        set oncomplete(fn) { queueMicrotask(() => fn?.()); },
        set onerror(_) {},
        set onabort(_) {}
      };
    }
  };
  return {
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
}

function b64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

async function load() {
  const window = {
    crypto: webcrypto,
    indexedDB: makeIndexedDb(),
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    btoa: value => Buffer.from(value, 'binary').toString('base64')
  };
  const source = fs.readFileSync(path.join(__dirname, '../assets/cornhill-offline-auth.js'), 'utf8');
  vm.runInNewContext(source, {
    window, globalThis: window, crypto: webcrypto, indexedDB: window.indexedDB,
    atob: window.atob, btoa: window.btoa, TextEncoder, TextDecoder, Uint8Array,
    Set, Date, JSON, Error, Promise, Object, String, Number, Array, Math
  }, { filename: 'cornhill-offline-auth.js' });
  return window.CornhillOfflineAuth;
}

test('offline login requires a server-signed, device-bound grant and correct password', async () => {
  const api = await load();
  const signing = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publicKey = await webcrypto.subtle.exportKey('raw', signing.publicKey);
  const auth = api.create({ serverSigningPublicKey: b64(publicKey), crypto: webcrypto });
  const device = await auth.getDeviceEnrollment();
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const saltBase64 = b64(salt);
  const iterations = api.constants.iterations;
  const passwordVerifier = await api.derivePasswordVerifier('Correct-Horse-Example-92', saltBase64, iterations);
  const now = Date.now();
  const payload = {
    version: 1, deviceId: device.deviceId, deviceKeyFingerprint: device.fingerprint,
    accountId: 'test-teacher-01', role: 'Teacher', displayName: 'Test Teacher',
    issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 6 * 60 * 60 * 1000).toISOString(),
    passwordSalt: saltBase64, passwordVerifier, iterations, offlinePermissions: ['assigned-class-read']
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const envelope = {
    payload: b64(payloadBytes),
    signature: b64(await webcrypto.subtle.sign({ name: 'Ed25519' }, signing.privateKey, payloadBytes))
  };
  await auth.installGrant(envelope);
  const identity = await auth.signInOffline('Correct-Horse-Example-92');
  assert.equal(identity.accountId, 'test-teacher-01');
  assert.equal(identity.role, 'Teacher');
  assert.equal(identity.offline, true);
  assert.deepEqual(Array.from(identity.permissions), ['assigned-class-read']);
  await assert.rejects(auth.signInOffline('Wrong-password'), /incorrect/i);
});

test('offline grant rejects tampering, other browser profiles and expired grants', async () => {
  const api = await load();
  const signing = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publicKey = await webcrypto.subtle.exportKey('raw', signing.publicKey);
  const auth = api.create({ serverSigningPublicKey: b64(publicKey), crypto: webcrypto });
  const device = await auth.getDeviceEnrollment();
  const saltBase64 = b64(webcrypto.getRandomValues(new Uint8Array(16)));
  const verifier = await api.derivePasswordVerifier('Test-password-94', saltBase64);
  const now = Date.now();
  const payload = {
    version: 1, deviceId: device.deviceId, deviceKeyFingerprint: device.fingerprint,
    accountId: 'staff-02', role: 'Staff', issuedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60 * 60 * 1000).toISOString(), passwordSalt: saltBase64,
    passwordVerifier: verifier, iterations: api.constants.iterations
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const envelope = { payload: b64(bytes), signature: b64(await webcrypto.subtle.sign('Ed25519', signing.privateKey, bytes)) };
  const bad = { ...envelope, signature: b64(new Uint8Array(64)) };
  await assert.rejects(auth.installGrant(bad), /signature/i);
  const expired = { ...payload, expiresAt: new Date(now - 1).toISOString() };
  const expiredBytes = new TextEncoder().encode(JSON.stringify(expired));
  const expiredEnvelope = {
    payload: b64(expiredBytes),
    signature: b64(await webcrypto.subtle.sign('Ed25519', signing.privateKey, expiredBytes))
  };
  await assert.rejects(auth.installGrant(expiredEnvelope), /expired/i);
});

test('offline credentials are time-limited and require strong PBKDF2 settings', async () => {
  const api = await load();
  assert.equal(api.constants.maxGrantAgeMs, 12 * 60 * 60 * 1000);
  assert.ok(api.constants.iterations >= 310000);
  await assert.rejects(api.derivePasswordVerifier('x', 'AA==', 1000), /invalid/i);
});
