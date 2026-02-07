// Reference Store - IndexedDB wrapper for shoulder triangle reference pose
// Stores triangle landmarks (nose, L shoulder, R shoulder) + computed ratio

const DB_NAME = 'shadow-nudge'
const DB_VERSION = 1
const STORE_NAME = 'reference'
const REFERENCE_KEY = 'current'

/** A single normalized landmark with optional depth */
export interface Landmark {
  x: number
  y: number
  z?: number
}

/** The stored reference pose data */
export interface ReferencePose {
  nose: Landmark
  leftShoulder: Landmark
  rightShoulder: Landmark
  /** shoulder_width / shoulder_midpoint_to_nose_distance */
  ratio: number
  /** ISO timestamp of when the reference was captured */
  capturedAt: string
}

/**
 * Opens (or creates) the IndexedDB database with schema versioning.
 * Returns a promise that resolves to the database instance.
 */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
        console.info('[ReferenceStore] Created object store:', STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Calculates the shoulder triangle ratio from three landmarks.
 * Ratio = shoulder_width / shoulder_midpoint_to_nose_distance
 *
 * A decrease in this ratio (vs reference) indicates forward shoulder rounding,
 * as the apparent shoulder width narrows due to foreshortening.
 */
export function calculateTriangleRatio(
  nose: Landmark,
  leftShoulder: Landmark,
  rightShoulder: Landmark,
): number {
  const shoulderWidth = Math.sqrt(
    (rightShoulder.x - leftShoulder.x) ** 2 + (rightShoulder.y - leftShoulder.y) ** 2,
  )

  const midpointX = (leftShoulder.x + rightShoulder.x) / 2
  const midpointY = (leftShoulder.y + rightShoulder.y) / 2

  const midpointToNose = Math.sqrt((nose.x - midpointX) ** 2 + (nose.y - midpointY) ** 2)

  // Guard against division by zero
  if (midpointToNose === 0) return 0

  return shoulderWidth / midpointToNose
}

/**
 * Saves a reference pose to IndexedDB.
 */
export async function saveReference(pose: ReferencePose): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.put(pose, REFERENCE_KEY)

    request.onsuccess = () => {
      console.info('[ReferenceStore] Reference pose saved')
      resolve()
    }
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

/**
 * Loads the stored reference pose from IndexedDB.
 * Returns null if no reference has been captured yet.
 */
export async function loadReference(): Promise<ReferencePose | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(REFERENCE_KEY)

    request.onsuccess = () => {
      const result = request.result as ReferencePose | undefined
      resolve(result ?? null)
    }
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

/**
 * Checks whether a reference pose exists in IndexedDB without loading full data.
 */
export async function hasReference(): Promise<boolean> {
  const ref = await loadReference()
  return ref !== null
}

/**
 * Deletes the entire IndexedDB database, clearing all stored data.
 * Reusable for "Clear all local data" and future stored data (history, settings, etc.).
 */
export async function clearAllData(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => {
      console.info('[ReferenceStore] All local data cleared')
      resolve()
    }
    request.onerror = () => reject(request.error)
  })
}
