/**
 * IndexedDB: jedyne trwałe miejsce na dane.
 * - `kv`: ustawienia, plan, katalog ćwiczeń, szkic treningu, wersja schematu danych
 * - `workouts`: historia treningów (klucz `id`)
 * - `bodyweight`: pomiary wagi ciała (klucz `id`)
 *
 * Wersja bazy (struktura magazynów) i wersja schematu danych (kształt rekordów)
 * są numerowane osobno; obie mają migracje uruchamiane po kolei.
 */
const DB_NAME = 'moj-trening';
const DB_VERSION = 1;

type StoreName = 'kv' | 'workouts' | 'bodyweight';

/** Migracje struktury bazy: indeks = wersja, z której się przechodzi. */
const DB_MIGRATIONS: ((db: IDBDatabase, tx: IDBTransaction) => void)[] = [
  // 0 → 1
  (db) => {
    db.createObjectStore('kv');
    const workouts = db.createObjectStore('workouts', { keyPath: 'id' });
    workouts.createIndex('startedAt', 'startedAt');
    db.createObjectStore('bodyweight', { keyPath: 'id' });
  },
];

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction!;
      for (let v = event.oldVersion; v < DB_VERSION; v++) DB_MIGRATIONS[v](db, tx);
    };
    req.onsuccess = () => {
      const db = req.result;
      // Inna karta otworzyła nowszą wersję: zamknij, żeby nie blokować aktualizacji.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Baza danych jest zablokowana przez inną kartę.'));
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transakcja przerwana'));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return request(db.transaction(store).objectStore(store).getAll() as IDBRequest<T[]>);
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return request(db.transaction('kv').objectStore('kv').get(key) as IDBRequest<T | undefined>);
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('kv', 'readwrite');
  tx.objectStore('kv').put(value, key);
  return done(tx);
}

export async function kvDelete(key: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('kv', 'readwrite');
  tx.objectStore('kv').delete(key);
  return done(tx);
}

export async function put(store: Exclude<StoreName, 'kv'>, value: unknown): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  return done(tx);
}

export async function remove(store: Exclude<StoreName, 'kv'>, key: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return done(tx);
}

/** Zastępuje całą zawartość bazy w jednej transakcji (import kopii). */
export async function replaceAll(
  kv: Record<string, unknown>,
  workouts: unknown[],
  bodyweight: unknown[],
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['kv', 'workouts', 'bodyweight'], 'readwrite');
  const kvStore = tx.objectStore('kv');
  kvStore.clear();
  for (const [k, v] of Object.entries(kv)) kvStore.put(v, k);
  const w = tx.objectStore('workouts');
  w.clear();
  for (const item of workouts) w.put(item);
  const b = tx.objectStore('bodyweight');
  b.clear();
  for (const item of bodyweight) b.put(item);
  return done(tx);
}
