const IDB_NAME = 'tm_screenshot';
const IDB_STORE = 'handles';
const FOLDER_KEY = 'folder';

function idbStore(mode) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result.transaction(IDB_STORE, mode).objectStore(IDB_STORE));
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const store = await idbStore('readonly');
  return new Promise((resolve, reject) => {
    const r = store.get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function idbSet(key, value) {
  const store = await idbStore('readwrite');
  return new Promise((resolve, reject) => {
    const r = store.put(value, key);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

async function idbDelete(key) {
  const store = await idbStore('readwrite');
  return new Promise((resolve, reject) => {
    const r = store.delete(key);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

async function verifyReadWritePermission(handle) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

async function writeToHandle(handle, filename, blob) {
  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

(async () => {
  const img = document.getElementById('sp-img');
  const saveBtn = document.getElementById('sp-save');
  const warningEl = document.getElementById('sp-warning');
  const statusEl = document.getElementById('sp-status');
  const folderNameEl = document.getElementById('sp-folder-name');
  const pickBtn = document.getElementById('sp-folder-pick');
  const clearBtn = document.getElementById('sp-folder-clear');

  let folderHandle = null;

  function updateFolderUI() {
    folderNameEl.textContent = folderHandle ? `📁 ${folderHandle.name}` : '既定のダウンロードフォルダ';
    clearBtn.hidden = !folderHandle;
  }

  if (window.showDirectoryPicker) {
    try { folderHandle = (await idbGet(FOLDER_KEY)) || null; } catch (_) { folderHandle = null; }
    updateFolderUI();

    pickBtn.addEventListener('click', async () => {
      try {
        folderHandle = await window.showDirectoryPicker();
        await idbSet(FOLDER_KEY, folderHandle);
        updateFolderUI();
      } catch (e) {
        if (e && e.name === 'AbortError') return; // ユーザによるキャンセルは無視
        statusEl.textContent = '⚠ フォルダを選択できませんでした（' + ((e && e.message) || e) + '）';
      }
    });
    clearBtn.addEventListener('click', async () => {
      folderHandle = null;
      await idbDelete(FOLDER_KEY);
      updateFolderUI();
    });
  } else {
    pickBtn.hidden = true;
  }

  const data = await chrome.storage.session.get('tm_screenshot_pending');
  chrome.storage.session.remove('tm_screenshot_pending');
  const pending = data.tm_screenshot_pending;

  if (!pending || !pending.dataUrl) {
    statusEl.textContent = '⚠ プレビューを読み込めませんでした。ポップアップから撮影しなおしてください。';
    saveBtn.disabled = true;
    return;
  }

  img.src = pending.dataUrl;
  img.hidden = false;
  document.title = pending.filename;
  statusEl.textContent = pending.filename;
  if (pending.truncated) warningEl.hidden = false;

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    try {
      if (folderHandle) {
        if (!(await verifyReadWritePermission(folderHandle))) {
          statusEl.textContent = '⚠ フォルダへのアクセスが許可されませんでした。フォルダを選択し直してください';
          return;
        }
        const blob = await (await fetch(pending.dataUrl)).blob();
        await writeToHandle(folderHandle, pending.filename, blob);
        statusEl.textContent = `${pending.filename} を ${folderHandle.name} に保存しました`;
      } else {
        const a = document.createElement('a');
        a.href = pending.dataUrl;
        a.download = pending.filename;
        a.click();
        statusEl.textContent = `${pending.filename} を保存しました`;
      }
    } catch (e) {
      statusEl.textContent = '⚠ 保存に失敗しました（' + ((e && e.message) || e) + '）';
    } finally {
      saveBtn.disabled = false;
    }
  });
})();
