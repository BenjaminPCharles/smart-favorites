const DATABASE_NAME = 'smart-favorites'
const DATABASE_VERSION = 1
const STORE_NAME = 'device-key'
const RECORD_KEY = 'current'

export interface StoredDeviceKey {
  privateKey: CryptoKey
  publicKeyB64Url: string
  createdAt: number
}

/**
 * Opens the db, creating the store on first run.
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
 * Runs one IndexedDB transaction then closes, resolving only once the write is durable.
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

/**
 * Replaces any previous key.
 */
export async function writeDeviceKey(deviceKey: StoredDeviceKey): Promise<void> {
  await withStore('readwrite', store => store.put(deviceKey, RECORD_KEY))
}

/**
 * Used when the server stops accepting the key.
 */
export async function deleteDeviceKey(): Promise<void> {
  await withStore('readwrite', store => store.delete(RECORD_KEY))
}
