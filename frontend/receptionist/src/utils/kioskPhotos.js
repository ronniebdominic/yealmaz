// Ye-Almaz — Kiosk photo store (IndexedDB, on the tablet only)
//
// A PIN on a shared terminal proves knowledge, not identity — someone can
// hand their PIN to a colleague. The photo taken at the moment of the
// punch is what closes that gap: HR can look at a disputed punch and see
// who actually stood there.
//
// Photos stay ON THE TABLET by design. They are never uploaded, so no
// staff imagery reaches the server, Railway or any backup, and the lab
// carries no cloud-side biometric-image liability. The trade-off is
// deliberate and worth knowing: if the tablet is lost, wiped, or its
// browser storage is cleared, the photos go with it. Only the attendance
// events themselves are durable (those are on the server).
//
// IndexedDB rather than localStorage: localStorage caps at ~5MB and holds
// strings only, which a few days of JPEGs would blow straight past.
const DB_NAME = 'ya-kiosk';
const DB_VERSION = 1;
const STORE = 'photos';

// Roughly a month of history at ~2 punches/person/day for ~34 staff.
// Browsers evict IndexedDB under storage pressure, so old photos are
// pruned deliberately rather than left to be dropped unpredictably.
export const RETENTION_DAYS = 30;
const MAX_PHOTOS = 4000;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'eventId' });
        store.createIndex('timestamp', 'timestamp');
        store.createIndex('employeeCode', 'employeeCode');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function savePhoto({ eventId, employeeCode, name, type, timestamp, blob }) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').put({ eventId, employeeCode, name, type, timestamp, blob, savedAt: Date.now() });
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
  db.close();
}

export async function listPhotos({ employeeCode, limit = 200 } = {}) {
  const db = await openDb();
  const all = await new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return all
    .filter(p => !employeeCode || p.employeeCode === employeeCode)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
}

// Drops anything past the retention window, then trims oldest-first if the
// store is still over the cap. Called after each save so housekeeping never
// needs a person to remember it.
export async function prunePhotos() {
  const db = await openDb();
  const all = await new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  const doomed = all.filter(p => new Date(p.timestamp).getTime() < cutoff).map(p => p.eventId);

  const survivors = all
    .filter(p => new Date(p.timestamp).getTime() >= cutoff)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  if (survivors.length > MAX_PHOTOS) {
    doomed.push(...survivors.slice(0, survivors.length - MAX_PHOTOS).map(p => p.eventId));
  }

  if (doomed.length) {
    const store = tx(db, 'readwrite');
    for (const id of doomed) store.delete(id);
  }
  db.close();
  return doomed.length;
}

export async function photoStats() {
  const db = await openDb();
  const all = await new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  const bytes = all.reduce((s, p) => s + (p.blob?.size || 0), 0);
  return {
    count: all.length,
    bytes,
    oldest: all.length ? all.reduce((m, p) => (new Date(p.timestamp) < new Date(m) ? p.timestamp : m), all[0].timestamp) : null,
  };
}

// Downscaled and JPEG-compressed before storage: a punch photo only needs
// to be good enough to recognise a face, and full-resolution frames would
// fill the tablet's quota in days.
export function captureFrame(video, { maxWidth = 480, quality = 0.6 } = {}) {
  return new Promise((resolve) => {
    try {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return resolve(null);
      const scale = Math.min(1, maxWidth / vw);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vw * scale);
      canvas.height = Math.round(vh * scale);
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(b => resolve(b), 'image/jpeg', quality);
    } catch {
      resolve(null); // a camera problem must never block a clock-in
    }
  });
}
