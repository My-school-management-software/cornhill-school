/* Device-local AES-GCM encryption for CORNHILL offline drafts.
   The non-exportable key stays in IndexedDB; private records are stored as ciphertext. */
(function () {
  'use strict';
  if (window.CornhillDraftCrypto) return;

  const DB_NAME = 'cornhill-draft-crypto-v1';
  const DB_VERSION = 1;
  const STORE = 'keys';
  const KEY_ID = 'device-aes-gcm-v1';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let dbPromise = null;
  let keyPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB || !window.crypto || !window.crypto.subtle) {
        reject(new Error('This browser cannot open encrypted offline storage.'));
        return;
      }
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error('Encrypted offline key storage could not be opened.'));
      };
      request.onblocked = () => {
        dbPromise = null;
        reject(new Error('Encrypted offline key storage is busy in another tab. Close the other CORNHILL tab and retry.'));
      };
    });
    return dbPromise;
  }

  async function readStoredKey() {
    const db = await openDb();
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY_ID);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result && request.result.key ? request.result.key : null);
      request.onerror = () => reject(request.error || new Error('Could not read the offline encryption key.'));
    });
  }

  async function addStoredKey(key) {
    const db = await openDb();
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).add({ id: KEY_ID, key });
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(key);
      request.onerror = () => reject(request.error || new Error('Could not save the offline encryption key.'));
    });
  }

  async function getDeviceKey() {
    if (!keyPromise) {
      keyPromise = (async () => {
        const saved = await readStoredKey();
        if (saved) return saved;
        const generated = await window.crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
        );
        try {
          return await addStoredKey(generated);
        } catch (_) {
          // Another tab may have created the non-exportable key at the same time.
          const raced = await readStoredKey();
          if (raced) return raced;
          throw new Error('The offline encryption key could not be stored on this device.');
        }
      })().catch(error => {
        keyPromise = null;
        throw error;
      });
    }
    return keyPromise;
  }

  async function seal(value, associatedData) {
    const key = await getDeviceKey();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const aad = encoder.encode(String(associatedData || ''));
    const plaintext = encoder.encode(JSON.stringify(value));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad }, key, plaintext
    );
    return {
      version: 1,
      algorithm: 'AES-GCM',
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(encrypted))
    };
  }

  async function open(record, associatedData) {
    if (!record || record.version !== 1 || record.algorithm !== 'AES-GCM' ||
        !Array.isArray(record.iv) || !Array.isArray(record.ciphertext)) {
      throw new Error('The saved offline draft has an unsupported encrypted format.');
    }
    const key = await getDeviceKey();
    const plaintext = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(record.iv),
        additionalData: encoder.encode(String(associatedData || ''))
      },
      key,
      new Uint8Array(record.ciphertext)
    );
    return JSON.parse(decoder.decode(plaintext));
  }

  window.CornhillDraftCrypto = Object.freeze({ seal, open });
})();
