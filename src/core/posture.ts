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
}

const DEFAULTS: Required<PostureDeviationOptions> = {
  windowSize: 10,
  framesToTrigger: 4,
  ratioDropThreshold: 0.07,
  headTiltLowConfidenceThreshold: 0.8,
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
 * Emits a single alert when posture deviation becomes true.
 * Uses AlertEngine for cooldown; this avoids per-frame spam via rising-edge detection.
 */
export class PostureDeviation {
  private readonly opts: Required<PostureDeviationOptions>

  private ratioAvg: MovingAverage
  private headDeltaAvg: MovingAverage

  private badStreak = 0
  private wasBad = false

  constructor(opts: PostureDeviationOptions = {}) {
    this.opts = { ...DEFAULTS, ...opts }
    this.ratioAvg = new MovingAverage(this.opts.windowSize)
    this.headDeltaAvg = new MovingAverage(this.opts.windowSize)
  }

  public reset(): void {
    this.ratioAvg.reset()
    this.headDeltaAvg.reset()
    this.badStreak = 0
    this.wasBad = false
  }

  /** Marks that an emitted alert was actually shown (i.e., not suppressed by cooldown). */
  public acknowledge(): void {
    this.wasBad = true
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

    const refRatio = reference.ratio
    const ratioThreshold = refRatio * (1 - this.opts.ratioDropThreshold)

    const isBad = liveRatio > 0 && liveRatio < ratioThreshold

    if (!isBad) {
      this.badStreak = 0
      this.wasBad = false
      return null
    }

    this.badStreak++
    if (this.badStreak < this.opts.framesToTrigger) return null

    // Emit until acknowledged (AlertEngine handles global cooldown).
    if (this.wasBad) return null

    const refHeadDelta = noseToShoulderMidpointDeltaY(
      reference.nose,
      reference.leftShoulder,
      reference.rightShoulder,
    )

    // If the head dropped substantially vs reference, treat as low confidence (head tilt guard).
    const headDeltaRatio = refHeadDelta > 0 ? liveHeadDelta / refHeadDelta : 1
    const isLowConfidence = headDeltaRatio < this.opts.headTiltLowConfidenceThreshold

    return {
      variant: isLowConfidence ? 'low-confidence' : 'normal',
      reason: 'Posture',
      liveRatio,
      refRatio,
    }
  }
}
