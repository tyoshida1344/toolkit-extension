/**
 * blob-store.js — 録画済み動画 Blob の受け渡し用 IndexedDB ヘルパー
 *
 * 動画 Blob は chrome.storage.session の容量制約に収まらないため、
 * 拡張機能オリジン共通の IndexedDB に一時保存し、offscreen document（書き込み）と
 * プレビュータブ（読み込み）の間で受け渡す。offscreen.html / video-preview.html の両方から読み込まれる。
 */
const TkVideoBlobStore = (() => {
  const DB_NAME = 'tm_videocapture';
  const STORE_NAME = 'recordings';

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function put(id, record) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record, id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function takeAndDelete(id) {
    const db = await openDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => { store.delete(id); resolve(req.result); };
      req.onerror = () => reject(req.error);
    });
    db.close();
    return record;
  }

  return { put, takeAndDelete };
})();
