// Hand/face proximity detection
// Computes distances between hand landmarks and the face region and reports when hands are near the face.

import type { Results } from '@mediapipe/holistic'

type Point = { x: number; y: number; z?: number }

type Rect = { minX: number; minY: number; maxX: number; maxY: number }

export type ProximityAlert = {
  variant: 'normal' | 'low-confidence'
  reason: string
  /** Normalized distance to face rectangle (0 when inside). */
  normalizedDistance: number
}

export type HandFaceProximityOptions = {
  /** How many consecutive near frames are required to trigger. */
  framesToTrigger?: number

  /**
   * Normalized distance threshold relative to face size.
   * 0.0 means "inside face bbox" only.
   */
  normalizedDistanceThreshold?: number

  /** If face bbox is tiny, treat the alert as low-confidence. */
  minFaceSize?: number

  /**
   * Max allowed |handZ - faceZ| to consider "near face".
   * If Z is missing, the Z gate is skipped.
   */
  zDistanceThreshold?: number
}

const DEFAULTS: Required<HandFaceProximityOptions> = {
  framesToTrigger: 3,
  normalizedDistanceThreshold: 0.18,
  minFaceSize: 0.08,
  zDistanceThreshold: 0.12,
}

function computeBoundingBox(points: Point[]): Rect | null {
  if (!points.length) return null

  let minX = 1,
    minY = 1,
    maxX = 0,
    maxY = 0

  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  return { minX, minY, maxX, maxY }
}

function distancePointToRect(p: Point, r: Rect): number {
  const dx = p.x < r.minX ? r.minX - p.x : p.x > r.maxX ? p.x - r.maxX : 0
  const dy = p.y < r.minY ? r.minY - p.y : p.y > r.maxY ? p.y - r.maxY : 0
  return Math.sqrt(dx * dx + dy * dy)
}

function minDistanceToRect(points: Point[], rect: Rect): number {
  let min = Number.POSITIVE_INFINITY
  for (const p of points) {
    const d = distancePointToRect(p, rect)
    if (d < min) min = d
  }
  return min
}

function meanZ(points: Point[]): number | null {
  let sum = 0
  let count = 0
  for (const p of points) {
    if (typeof p.z === 'number' && Number.isFinite(p.z)) {
      sum += p.z
      count++
    }
  }

  if (count === 0) return null
  return sum / count
}

/**
 * State machine that emits a single alert when "hands near face" becomes true.
 *
 * Note: rate limiting is handled by AlertEngine (global cooldown). This detector
 * only prevents per-frame spam by emitting on the rising edge.
 */
export class HandFaceProximity {
  private readonly opts: Required<HandFaceProximityOptions>

  private nearStreak = 0
  private wasNear = false

  constructor(opts: HandFaceProximityOptions = {}) {
    this.opts = { ...DEFAULTS, ...opts }
  }

  public reset(): void {
    this.nearStreak = 0
    this.wasNear = false
  }

  /** Marks that an emitted alert was actually shown (i.e., not suppressed by cooldown). */
  public acknowledge(): void {
    this.wasNear = true
  }

  public update(results: Results): ProximityAlert | null {
    const face = results.faceLandmarks ?? []
    const leftHand = results.leftHandLandmarks ?? []
    const rightHand = results.rightHandLandmarks ?? []

    if (!face.length || (!leftHand.length && !rightHand.length)) {
      this.reset()
      return null
    }

    const faceRect = computeBoundingBox(face)
    if (!faceRect) {
      this.reset()
      return null
    }

    const faceW = faceRect.maxX - faceRect.minX
    const faceH = faceRect.maxY - faceRect.minY
    const faceSize = Math.max(faceW, faceH)

    if (faceSize <= 0) {
      this.reset()
      return null
    }

    // Minimum distance from any hand landmark to the face bounding rectangle.
    const leftDist = leftHand.length
      ? minDistanceToRect(leftHand, faceRect)
      : Number.POSITIVE_INFINITY
    const rightDist = rightHand.length
      ? minDistanceToRect(rightHand, faceRect)
      : Number.POSITIVE_INFINITY
    const dist = Math.min(leftDist, rightDist)

    const normalizedDistance = dist / faceSize

    // Z-depth gate: if the hand is significantly closer/farther than the face, suppress.
    const faceZ = meanZ(face)
    const leftZ = meanZ(leftHand)
    const rightZ = meanZ(rightHand)
    const handZ = Math.min(leftZ ?? Number.POSITIVE_INFINITY, rightZ ?? Number.POSITIVE_INFINITY)

    const zOk =
      faceZ === null || handZ === Number.POSITIVE_INFINITY
        ? true
        : Math.abs(handZ - faceZ) <= this.opts.zDistanceThreshold

    const isNear = normalizedDistance <= this.opts.normalizedDistanceThreshold && zOk

    if (isNear) {
      this.nearStreak++
    } else {
      this.nearStreak = 0
      this.wasNear = false
      return null
    }

    if (this.nearStreak < this.opts.framesToTrigger) return null

    if (this.nearStreak === this.opts.framesToTrigger) {
      console.debug(
        `[HandsNearFace] threshold reached: normalizedDistance=${normalizedDistance.toFixed(3)}, faceSize=${faceSize.toFixed(3)}, faceZ=${faceZ?.toFixed?.(3) ?? 'n/a'}, handZ=${handZ !== Number.POSITIVE_INFINITY ? handZ.toFixed(3) : 'n/a'}, zOk=${zOk}`,
      )
    }

    // Emit until acknowledged (AlertEngine handles global cooldown).
    if (this.wasNear) return null

    const isLowConfidence = faceSize < this.opts.minFaceSize

    return {
      variant: isLowConfidence ? 'low-confidence' : 'normal',
      reason: 'Hands near face',
      normalizedDistance,
    }
  }
}
