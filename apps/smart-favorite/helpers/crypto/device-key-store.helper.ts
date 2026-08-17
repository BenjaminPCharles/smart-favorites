/**
 * IndexedDB and not storage.local, because a CryptoKey survives structured clone but
 * not JSON. That's the whole reason this file exists. Hand-rolled instead of `idb`:
 * one store, three operations, and a bad supply chain would hurt most right here.
 */

const DATABASE_NAME = 'smart-favorites'
const DATABASE_VERSION = 1
const STORE_NAME = 'device-key'
const RECORD_KEY = 'current'

export interface StoredDeviceKey {
  /** Non-extractable, no JavaScript path reads it back, ours included. */
  privateKey: CryptoKey
  /** P-256 SPKI DER, base64url. This is what every request sends. */
  publicKeyB64Url: string
  createdAt: number
}

/** Opens the db, creating the store on first run. */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const openRequest = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    openRequest.onupgradeneeded = () => {
      if (!openRequest.result.objectStoreNames.contains(STORE_NAME)) {
        openRequest.result.createObjectStore(STORE_NAME)
      }
    }
    openRequest.onsuccess = () => resolve(openRequest.result)
    openRequest.onerror = () => reject(openRequest.error ?? new Error('Could not open the local key store'))
    openRequest.onblocked = () => reject(new Error('Could not open the local key store'))
  })
}

/**
 * One transaction then close, so a version bump isn't blocked by an open popup.
 * Resolves on `complete` and not the request's `success`: only then is the write
 * durable, which is what makes writeDeviceKey a real barrier.
 */
async function withStore<TResult>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<TResult> {
  const database = await openDatabase()

  try {
    return await new Promise<TResult>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode)
      const storeRequest = run(transaction.objectStore(STORE_NAME))

      transaction.oncomplete = () => resolve(storeRequest.result as TResult)
      transaction.onabort = () => reject(transaction.error ?? new Error('Local key store transaction failed'))
      transaction.onerror = () => reject(transaction.error ?? new Error('Local key store transaction failed'))
    })
  }
  finally {
    database.close()
  }
}

export async function readDeviceKey(): Promise<StoredDeviceKey | undefined> {
  return withStore<StoredDeviceKey | undefined>('readonly', store => store.get(RECORD_KEY))
}

/** Replaces any previous key. */
export async function writeDeviceKey(deviceKey: StoredDeviceKey): Promise<void> {
  await withStore('readwrite', store => store.put(deviceKey, RECORD_KEY))
}

/** Used when the server stops accepting the key. */
export async function deleteDeviceKey(): Promise<void> {
  await withStore('readwrite', store => store.delete(RECORD_KEY))
}
