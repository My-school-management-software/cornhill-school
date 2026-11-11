/* CORNHILL offline account authentication.
 * This is a browser-profile-bound, server-authorised offline credential layer.
 * It does not replace online Supabase authentication or server-side RLS.
 */
(function (root) {
  'use strict';
  if (!root || root.CornhillOfflineAuth) return;

  const DB_NAME = 'cornhill-offline-auth-v1';
  const DB_VERSION = 1;
  const MAX_GRANT_AGE_MS = 12 * 60 * 60 * 1000;
  const ALLOWED_ROLES = new Set(['Admin', 'Teacher', 'Staff', 'SubjectTeacher']);
  const DEFAULT_ITERATIONS = 310000;

  function toBytes(value) {
    return new TextEncoder().encode(String(value));
  }
  function fromBase64(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  function toBase64(bytes) {
    let binary = '';
    for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  function equalBytes(left, right) {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
    return difference === 0;
  }
  function fail(message) {
    throw new Error(message);
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('device')) db.createObjectStore('device', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('grant')) db.createObjectStore('grant', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Offline account storage is unavailable.'));
    });
  }

  async function idbGet(store, id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction(store, 'readonly').objectStore(store).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Offline account read failed.'));
    });
  }

  async function idbPut(store, value) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error || new Error('Offline account save failed.'));
      tx.onabort = () => reject(tx.error || new Error('Offline account save was interrupted.'));
    });
  }

  async function idbDelete(store, id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Offline account removal failed.'));
    });
  }

  async function createDeviceRecord(cryptoApi) {
    const existing = await idbGet('device', 'local-device');
    if (existing && existing.keyPair && existing.deviceId && existing.fingerprint) return existing;
    const keyPair = await cryptoApi.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']
    );
    const publicKey = await cryptoApi.subtle.exportKey('spki', keyPair.publicKey);
    const digest = await cryptoApi.subtle.digest('SHA-256', publicKey);
    const record = {
      id: 'local-device',
      deviceId: cryptoApi.randomUUID(),
      keyPair,
      publicKey: toBase64(publicKey),
      fingerprint: toBase64(digest),
      lastSeenAt: 0
    };
    await idbPut('device', record);
    return record;
  }

  function create(options) {
    const cryptoApi = options && options.crypto || root.crypto;
    const publicSigningKey = options && options.serverSigningPublicKey;
    if (!cryptoApi || !cryptoApi.subtle) fail('Secure browser cryptography is unavailable.');
    if (!publicSigningKey) fail('The school server signing key has not been configured.');

    async function verifyEnvelope(envelope) {
      if (!envelope || typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string') {
        fail('The offline authorisation is missing or invalid.');
      }
      const key = await cryptoApi.subtle.importKey(
        'raw', fromBase64(publicSigningKey), { name: 'Ed25519' }, false, ['verify']
      );
      const valid = await cryptoApi.subtle.verify(
        { name: 'Ed25519' }, key, fromBase64(envelope.signature), fromBase64(envelope.payload)
      );
      if (!valid) fail('The offline authorisation signature is not valid.');
      let payload;
      try {
        payload = JSON.parse(new TextDecoder().decode(fromBase64(envelope.payload)));
      } catch (_) {
        fail('The offline authorisation could not be read.');
      }
      return payload;
    }

    async function checkGrant(payload, device, now) {
      if (!payload || payload.version !== 1) fail('This offline authorisation version is not supported.');
      if (payload.deviceId !== device.deviceId || payload.deviceKeyFingerprint !== device.fingerprint) {
        fail('This offline authorisation belongs to a different browser profile.');
      }
      if (!payload.accountId || !ALLOWED_ROLES.has(payload.role)) fail('The offline account role is not authorised.');
      const issuedAt = Date.parse(payload.issuedAt);
      const expiresAt = Date.parse(payload.expiresAt);
      if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) fail('The offline authorisation dates are invalid.');
      if (issuedAt > now + 60000 || expiresAt <= now || expiresAt <= issuedAt || expiresAt - issuedAt > MAX_GRANT_AGE_MS) {
        fail('The offline authorisation has expired or exceeds the 12-hour limit.');
      }
      if (!payload.passwordSalt || !payload.passwordVerifier || !Number.isInteger(payload.iterations) ||
          payload.iterations < DEFAULT_ITERATIONS || payload.iterations > 1000000) {
        fail('The offline password verifier is incomplete or too weak.');
      }
      if (now + 60000 < (device.lastSeenAt || 0)) fail('The device clock moved backwards. Connect online to verify this account.');
      return { expiresAt, issuedAt };
    }

    async function getDeviceEnrollment() {
      const device = await createDeviceRecord(cryptoApi);
      return {
        deviceId: device.deviceId,
        publicKey: device.publicKey,
        fingerprint: device.fingerprint
      };
    }

    async function installGrant(envelope) {
      const device = await createDeviceRecord(cryptoApi);
      const payload = await verifyEnvelope(envelope);
      await checkGrant(payload, device, Date.now());
      await idbPut('grant', { id: 'active-grant', envelope });
      return { installed: true, expiresAt: payload.expiresAt, role: payload.role };
    }

    async function signInOffline(password) {
      if (typeof password !== 'string' || !password) fail('Enter your account password.');
      const device = await idbGet('device', 'local-device');
      const saved = await idbGet('grant', 'active-grant');
      if (!device || !saved) fail('This browser has no offline-authorised account. Connect online first.');
      const payload = await verifyEnvelope(saved.envelope);
      const dates = await checkGrant(payload, device, Date.now());
      const material = await cryptoApi.subtle.importKey(
        'raw', toBytes(password), 'PBKDF2', false, ['deriveBits']
      );
      const derived = await cryptoApi.subtle.deriveBits({
        name: 'PBKDF2',
        salt: fromBase64(payload.passwordSalt),
        iterations: payload.iterations,
        hash: 'SHA-256'
      }, material, 256);
      if (!equalBytes(new Uint8Array(derived), fromBase64(payload.passwordVerifier))) {
        fail('The password is incorrect.');
      }
      const challenge = cryptoApi.getRandomValues(new Uint8Array(32));
      const proof = await cryptoApi.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' }, device.keyPair.privateKey, challenge
      );
      const proofValid = await cryptoApi.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' }, device.keyPair.publicKey, proof, challenge
      );
      if (!proofValid) fail('This browser profile could not prove its device key.');
      await idbPut('device', { ...device, lastSeenAt: Date.now() });
      return {
        accountId: payload.accountId,
        role: payload.role,
        displayName: payload.displayName || '',
        expiresAt: dates.expiresAt,
        offline: true,
        permissions: Array.isArray(payload.offlinePermissions) ? payload.offlinePermissions : []
      };
    }

    async function clearGrant() {
      await idbDelete('grant', 'active-grant');
    }

    return Object.freeze({ getDeviceEnrollment, installGrant, signInOffline, clearGrant });
  }

  root.CornhillOfflineAuth = Object.freeze({
    create,
    derivePasswordVerifier: async function (password, saltBase64, iterations) {
      const cryptoApi = root.crypto;
      const count = iterations || DEFAULT_ITERATIONS;
      if (!cryptoApi || !cryptoApi.subtle || count < DEFAULT_ITERATIONS || count > 1000000) {
        fail('Secure password-verifier settings are invalid.');
      }
      const material = await cryptoApi.subtle.importKey('raw', toBytes(password), 'PBKDF2', false, ['deriveBits']);
      const bits = await cryptoApi.subtle.deriveBits({
        name: 'PBKDF2', salt: fromBase64(saltBase64), iterations: count, hash: 'SHA-256'
      }, material, 256);
      return toBase64(bits);
    },
    constants: Object.freeze({ maxGrantAgeMs: MAX_GRANT_AGE_MS, iterations: DEFAULT_ITERATIONS })
  });
})(typeof window !== 'undefined' ? window : globalThis);
