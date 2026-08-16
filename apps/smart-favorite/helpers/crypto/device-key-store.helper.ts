/**
 * Persistence for the device key.
 *
 * IndexedDB and not `storage.local`: a CryptoKey survives structured clone, which
 * is what IndexedDB uses, but not the JSON serialisation `storage.local` performs.
 * That is the entire reason this file exists.
 *
 * Hand-rolled rather than pulling in `idb`: one store and three operations, and
 * this is the one path where a dependency's supply chain matters most.
 */

const DATABASE_NAME = 'smart-favorites'
const DATABASE_VERSION = 1
const STORE_NAME = 'device-key'
const RECORD_KEY = 'current'

export interface StoredDeviceKey {
  /** Non-extractable: no JavaScript path can read it back, ours included. */
  privateKey: CryptoKey
  /** P-256 SPKI DER, base64url — what every request sends. */
  publicKeyB64Url: string
  createdAt: number
}

/**
 * Open the database, creating the store on first run.
 * @return {Promise<IDBDatabase>}
 */
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
 * Run one transaction then close the connection, so a future version bump is never
 * blocked by a popup that stayed open.
 *
 * Resolves on `complete` and not on the request's `success`: only then is a write
 * durable, which is what makes writeDeviceKey a real barrier and gives "persist
 * before the network call" its meaning.
 * @param mode
 * @param run
 * @return {Promise<TResult>}
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

/**
 * Read the device key, if this browser profile has one.
 * @return {Promise<StoredDeviceKey | undefined>}
 */
export async function readDeviceKey(): Promise<StoredDeviceKey | undefined> {
  return withStore<StoredDeviceKey | undefined>('readonly', store => store.get(RECORD_KEY))
}

/**
 * Persist the device key, replacing any previous one.
 * @param deviceKey
 * @return {Promise<void>}
 */
export async function writeDeviceKey(deviceKey: StoredDeviceKey): Promise<void> {
  await withStore('readwrite', store => store.put(deviceKey, RECORD_KEY))
}

/**
 * Drop the device key — used when the server no longer accepts it.
 * @return {Promise<void>}
 */
export async function deleteDeviceKey(): Promise<void> {
  await withStore('readwrite', store => store.delete(RECORD_KEY))
}
