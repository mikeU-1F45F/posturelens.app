// Posture deviation detection
// Compares the live shoulder triangle ratio vs the captured reference.

import type { Results } from '@mediapipe/holistic'

import { LANDMARK_LEFT_SHOULDER, LANDMARK_NOSE, LANDMARK_RIGHT_SHOULDER } from './landmarks.ts'
import { calculateTriangleRatio, type Landmark, type ReferencePose } from './reference-store.ts'

export type PostureAlert = {
  variant: 'normal' | 'low-confidence'
  reason: string
  liveRatio: number
  refRatio: number
  postureScore: number
}

export type PostureScore = {
  /** Overall posture score (0-100, where 100 is perfect) */
  overall: number
  /** Ratio-based component (0-100) */
  ratioComponent: number
  /** Z-coordinate reinforcement component (0-100) */
  zComponent: number
  /** Head tilt guard factor (0-1, affects confidence) */
  headTiltConfidence: number
}

export type PostureDeviationOptions = {
  /** Moving average window (in processed frames). */
  windowSize?: number

  /** How many consecutive "bad" frames are required to trigger. */
  framesToTrigger?: number

  /** Ratio drop fraction required to consider posture deviated (e.g. 0.08 = 8%). */
  ratioDropThreshold?: number

  /** If head-tilt indicates head drop, treat as low confidence. */
  headTiltLowConfidenceThreshold?: number

  /** Z-score weight in overall posture calculation (0-1). */
  zWeight?: number

  /** Z-deviation threshold (how much closer shoulders are vs reference). */
  zDeviationThreshold?: number
}

const DEFAULTS: Required<PostureDeviationOptions> = {
  windowSize: 10,
  framesToTrigger: 4,
  ratioDropThreshold: 0.07,
  headTiltLowConfidenceThreshold: 0.8,
  zWeight: 0.3,
  zDeviationThreshold: 0.05,
}

type Triangle = { nose: Landmark; leftShoulder: Landmark; rightShoulder: Landmark }

function extractTriangle(
  poseLandmarks: Array<{ x: number; y: number; z?: number }>,
): Triangle | null {
  const nose = poseLandmarks[LANDMARK_NOSE]
  const leftShoulder = poseLandmarks[LANDMARK_LEFT_SHOULDER]
  const rightShoulder = poseLandmarks[LANDMARK_RIGHT_SHOULDER]

  if (!nose || !leftShoulder || !rightShoulder) return null

  return {
    nose: { x: nose.x, y: nose.y, z: nose.z },
    leftShoulder: { x: leftShoulder.x, y: leftShoulder.y, z: leftShoulder.z },
    rightShoulder: { x: rightShoulder.x, y: rightShoulder.y, z: rightShoulder.z },
  }
}

function noseToShoulderMidpointDeltaY(nose: Landmark, left: Landmark, right: Landmark): number {
  const midpointY = (left.y + right.y) / 2
  return midpointY - nose.y
}

class MovingAverage {
  private readonly windowSize: number
  private values: number[] = []
  private sum = 0

  constructor(windowSize: number) {
    this.windowSize = windowSize
  }

  public reset(): void {
    this.values = []
    this.sum = 0
  }

  public add(value: number): number {
    this.values.push(value)
    this.sum += value

    if (this.values.length > this.windowSize) {
      const removed = this.values.shift()
      if (removed !== undefined) this.sum -= removed
    }

    return this.sum / this.values.length
  }
}

/**
 * Calculate average Z depth for shoulder triangle landmarks.
 * Z values from MediaPipe are relative to hip midpoint (negative = closer to camera).
 */
function calculateAverageZ(tri: Triangle): number | null {
  const zValues = [tri.nose.z, tri.leftShoulder.z, tri.rightShoulder.z].filter(
    (z): z is number => typeof z === 'number' && Number.isFinite(z),
  )
  if (zValues.length === 0) return null
  return zValues.reduce((sum, z) => sum + z, 0) / zValues.length
}

/**
 * Calculate posture score components.
 * Returns scores from 0-100 where 100 is perfect posture.
 */
function calculatePostureScore(
  liveRatio: number,
  refRatio: number,
  liveZ: number | null,
  refZ: number | null,
  headTiltConfidence: number,
  opts: Required<PostureDeviationOptions>,
): PostureScore {
  // Ratio component: 100 when liveRatio >= refRatio, drops linearly to 0 at 50% drop
  const ratioDrop = Math.max(0, refRatio - liveRatio) / refRatio
  const ratioComponent = Math.max(0, 100 - ratioDrop * 200)

  // Z component: When shoulders round forward, they move closer to camera (more negative Z).
  // Compare live Z vs reference Z. If live is significantly closer (more negative), posture is worse.
  let zComponent = 100 // Default to perfect if Z data unavailable
  if (liveZ !== null && refZ !== null) {
    const zDiff = refZ - liveZ // Positive = live is closer to camera (worse posture)
    const zDeviation = Math.max(0, zDiff) / Math.abs(refZ || 1)
    zComponent = Math.max(0, 100 - (zDeviation / opts.zDeviationThreshold) * 100)
  }

  // Weighted combination
  const overall = Math.round(
    ratioComponent * (1 - opts.zWeight) + zComponent * opts.zWeight * headTiltConfidence,
  )

  return {
    overall: Math.max(0, Math.min(100, overall)),
    ratioComponent: Math.round(ratioComponent),
    zComponent: Math.round(zComponent),
    headTiltConfidence: Math.round(headTiltConfidence * 100) / 100,
  }
}

/**
 * Emits a single alert when posture deviation becomes true.
 * Uses AlertEngine for cooldown; this avoids per-frame spam via rising-edge detection.
 * Now includes Z-coordinate reinforcement and overall posture scoring.
 */
export class PostureDeviation {
  private readonly opts: Required<PostureDeviationOptions>

  private ratioAvg: MovingAverage
  private headDeltaAvg: MovingAverage
  private zAvg: MovingAverage

  private badStreak = 0
  private wasBad = false
  private lastScore: PostureScore | null = null

  constructor(opts: PostureDeviationOptions = {}) {
    this.opts = { ...DEFAULTS, ...opts }
    this.ratioAvg = new MovingAverage(this.opts.windowSize)
    this.headDeltaAvg = new MovingAverage(this.opts.windowSize)
    this.zAvg = new MovingAverage(this.opts.windowSize)
  }

  public reset(): void {
    this.ratioAvg.reset()
    this.headDeltaAvg.reset()
    this.zAvg.reset()
    this.badStreak = 0
    this.wasBad = false
    this.lastScore = null
  }

  /** Marks that an emitted alert was actually shown (i.e., not suppressed by cooldown). */
  public acknowledge(): void {
    this.wasBad = true
  }

  /** Get the last calculated posture score (for UI/debugging). */
  public getLastScore(): PostureScore | null {
    return this.lastScore
  }

  public update(results: Results, reference: ReferencePose): PostureAlert | null {
    const pose = results.poseLandmarks ?? []
    if (!pose.length) {
      this.reset()
      return null
    }

    const tri = extractTriangle(pose)
    if (!tri) {
      this.reset()
      return null
    }

    const liveRatioInstant = calculateTriangleRatio(tri.nose, tri.leftShoulder, tri.rightShoulder)
    const liveRatio = this.ratioAvg.add(liveRatioInstant)

    const liveHeadDeltaInstant = noseToShoulderMidpointDeltaY(
      tri.nose,
      tri.leftShoulder,
      tri.rightShoulder,
    )
    const liveHeadDelta = this.headDeltaAvg.add(liveHeadDeltaInstant)

    // Calculate Z-coordinate average as secondary reinforcement signal
    const liveZInstant = calculateAverageZ(tri)
    const liveZ = liveZInstant !== null ? this.zAvg.add(liveZInstant) : null

    const refRatio = reference.ratio
    const ratioThreshold = refRatio * (1 - this.opts.ratioDropThreshold)

    const isBad = liveRatio > 0 && liveRatio < ratioThreshold

    // Calculate reference Z average from stored landmarks
    const refZ = calculateAverageZ({
      nose: reference.nose,
      leftShoulder: reference.leftShoulder,
      rightShoulder: reference.rightShoulder,
    })

    const refHeadDelta = noseToShoulderMidpointDeltaY(
      reference.nose,
      reference.leftShoulder,
      reference.rightShoulder,
    )

    // If the head dropped substantially vs reference, treat as low confidence (head tilt guard).
    const headDeltaRatio = refHeadDelta > 0 ? liveHeadDelta / refHeadDelta : 1
    const headTiltConfidence = Math.min(
      1,
      headDeltaRatio / this.opts.headTiltLowConfidenceThreshold,
    )

    // Calculate overall posture score
    const score = calculatePostureScore(
      liveRatio,
      refRatio,
      liveZ,
      refZ,
      headTiltConfidence,
      this.opts,
    )
    this.lastScore = score

    if (!isBad) {
      this.badStreak = 0
      this.wasBad = false
      return null
    }

    this.badStreak++
    if (this.badStreak < this.opts.framesToTrigger) return null

    // Emit until acknowledged (AlertEngine handles global cooldown).
    if (this.wasBad) return null

    const isLowConfidence = headDeltaRatio < this.opts.headTiltLowConfidenceThreshold

    if (this.badStreak === this.opts.framesToTrigger) {
      console.debug(
        `[PostureDeviation] Alert triggered: ratio=${liveRatio.toFixed(4)}, ref=${refRatio.toFixed(4)}, score=${score.overall}, zComponent=${score.zComponent}`,
      )
    }

    return {
      variant: isLowConfidence ? 'low-confidence' : 'normal',
      reason: 'Posture',
      liveRatio,
      refRatio,
      postureScore: score.overall,
    }
  }
}
