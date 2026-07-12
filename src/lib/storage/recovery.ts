// Crash-recovery working copy, keyed per tool.
//
// Files are canonical. This is ONLY a recovery copy so a reload, crash, or closed
// tab doesn't lose in-progress edits (hard rule #6). It stores the serialized
// document plus whether it has diverged from the last exported file (`dirty`), so
// the divergence indicator survives a reload. IndexedDB is the browser-persistence
// mechanism the design permits (hard rule #4); nothing here leaves the machine.
//
// Framework-free apart from the IndexedDB browser API — the designated storage
// boundary, swappable in a future desktop/CLI build. All access is lazy and
// best-effort: if IndexedDB is unavailable (SSR, private mode, disabled), every
// function degrades to a no-op and the app keeps working without persistence.

export interface WorkingCopy {
  /** Per-tool key, e.g. "outcomes". */
  tool: string;
  /** Serialized document text (the canonical serialization). */
  text: string;
  /** Name of the file this session came from, if any. */
  fileName: string | null;
  /** True when edited since the last import/export. */
  dirty: boolean;
  /** Epoch ms of this save. */
  savedAt: number;
}

const DB_NAME = "drawbridge";
const STORE = "working";
const VERSION = 1;

function available(): boolean {
  return typeof indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "tool" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = op(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function saveWorkingCopy(wc: WorkingCopy): Promise<void> {
  if (!available()) return;
  try {
    await run("readwrite", (s) => s.put(wc));
  } catch {
    /* best-effort: persistence is a safety net, never load-bearing */
  }
}

export async function loadWorkingCopy(tool: string): Promise<WorkingCopy | undefined> {
  if (!available()) return undefined;
  try {
    return await run<WorkingCopy | undefined>("readonly", (s) => s.get(tool));
  } catch {
    return undefined;
  }
}

export async function clearWorkingCopy(tool: string): Promise<void> {
  if (!available()) return;
  try {
    await run("readwrite", (s) => s.delete(tool));
  } catch {
    /* best-effort */
  }
}
