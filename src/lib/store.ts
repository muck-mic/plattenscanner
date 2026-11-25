// The user's own list, kept in IndexedDB on this device.

export interface SavedRecord {
  id: string
  releaseId: number
  title: string
  artist: string
  label: string
  catno: string
  country: string
  year: string
  format: string
  thumb: string
  discogsUrl: string
  mediaCondition: string
  sleeveCondition: string
  notes: string
  matrixRead: string[] // what Claude read in the run-out groove, if a matrix photo was taken
  matrixScore: number | null
  discogsInstanceId: number | null // set when it was also added to the Discogs collection
  addedAt: string // ISO date
}

const DB = 'plattenscanner'
const STORE = 'records'

let dbPromise: Promise<IDBDatabase> | null = null

function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'id' })
      store.createIndex('releaseId', 'releaseId')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  // Ask the browser not to evict the list when storage runs low.
  navigator.storage?.persist?.().catch(() => {})
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        tx.oncomplete = () => resolve(req.result)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      }),
  )
}

const listeners = new Set<() => void>()
/** Called whenever the list changes, so open screens can reload. */
export function onListChange(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const changed = () => listeners.forEach((fn) => fn())

export async function addRecord(r: Omit<SavedRecord, 'id' | 'addedAt'>) {
  const record: SavedRecord = { ...r, id: crypto.randomUUID(), addedAt: new Date().toISOString() }
  await run('readwrite', (s) => s.add(record))
  changed()
  return record
}

export async function updateRecord(record: SavedRecord) {
  await run('readwrite', (s) => s.put(record))
  changed()
}

/** Restores records from a backup; entries with the same id are replaced, so importing twice adds nothing. */
export async function putRecords(records: SavedRecord[]) {
  await db().then(
    (d) =>
      new Promise<void>((resolve, reject) => {
        const tx = d.transaction(STORE, 'readwrite')
        const store = tx.objectStore(STORE)
        for (const r of records) store.put(r)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      }),
  )
  changed()
}

export async function deleteRecord(id: string) {
  await run('readwrite', (s) => s.delete(id))
  changed()
}

export async function allRecords() {
  const list = await run<SavedRecord[]>('readonly', (s) => s.getAll())
  return list.sort((a, b) => b.addedAt.localeCompare(a.addedAt))
}

export async function recordsForRelease(releaseId: number) {
  return run<SavedRecord[]>('readonly', (s) => s.index('releaseId').getAll(releaseId))
}

// Standard Discogs grading, used for the local list (and when the collection fields can't be loaded).
export const MEDIA_CONDITIONS = [
  'Mint (M)',
  'Near Mint (NM or M-)',
  'Very Good Plus (VG+)',
  'Very Good (VG)',
  'Good Plus (G+)',
  'Good (G)',
  'Fair (F)',
  'Poor (P)',
]
export const SLEEVE_CONDITIONS = [...MEDIA_CONDITIONS, 'Generic', 'Not Graded', 'No Cover']
