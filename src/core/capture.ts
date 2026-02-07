// Reference pose capture — 3-second averaged capture session

import {
  showErrorToast,
  syncStartButton,
  updateReferenceStatus,
  updateStatusDisplay,
} from '../ui.ts'
import { setCaptureOverlayText } from './canvas-renderer.ts'
import { LANDMARK_LEFT_SHOULDER, LANDMARK_NOSE, LANDMARK_RIGHT_SHOULDER } from './landmarks.ts'
import {
  calculateTriangleRatio,
  type Landmark,
  type ReferencePose,
  saveReference,
} from './reference-store.ts'

const MIN_CAPTURE_FRAMES = 10

/** Capture state: when true, onDetectorResults collects triangle landmarks */
let isCapturing = false
const captureBuffer: Array<{ nose: Landmark; leftShoulder: Landmark; rightShoulder: Landmark }> = []

/** Whether capture is currently in progress */
export function getIsCapturing(): boolean {
  return isCapturing
}

/** Returns the capture buffer for frame collection from onDetectorResults */
export function getCaptureBuffer(): typeof captureBuffer {
  return captureBuffer
}

/**
 * Extracts triangle landmarks from pose results.
 * Returns null if any of the 3 required landmarks are missing.
 */
export function extractTriangleLandmarks(
  poseLandmarks: Array<{ x: number; y: number; z?: number }>,
): { nose: Landmark; leftShoulder: Landmark; rightShoulder: Landmark } | null {
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

/**
 * Runs a 3-second reference pose capture session.
 * Collects triangle landmarks each processed frame, averages them,
 * computes the ratio, and saves to IndexedDB.
 *
 * Returns the saved ReferencePose on success, or null on failure.
 */
export async function captureReferencePose(
  captureBtn: HTMLButtonElement,
  startBtn: HTMLButtonElement,
  ensureDetectionRunning: () => Promise<void>,
  getDetectionState: () => { running: boolean; currentReference: ReferencePose | null },
): Promise<ReferencePose | null> {
  captureBtn.disabled = true
  startBtn.disabled = true

  // Ensure webcam and detection are running before capture
  const state = getDetectionState()
  if (!state.running) {
    try {
      await ensureDetectionRunning()
    } catch (error) {
      console.error('[Capture] Failed to start webcam:', error)
      showErrorToast('Failed to start webcam for capture')
      captureBtn.disabled = false
      return null
    }
  }

  // Reset capture state
  captureBuffer.length = 0
  isCapturing = true

  // Pre-countdown instruction
  setCaptureOverlayText('🧘')
  updateStatusDisplay('Good posture please...')
  await new Promise((resolve) => setTimeout(resolve, 1500))

  // Countdown: 3... 2... 1...
  for (let i = 3; i > 0; i--) {
    setCaptureOverlayText(String(i))
    updateStatusDisplay(`Hold good posture... ${i}`)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  // Finalize capture
  setCaptureOverlayText('')
  updateStatusDisplay('Capturing...')

  // Wait a beat for the buffer to finalize
  await new Promise((resolve) => setTimeout(resolve, 200))
  isCapturing = false

  // Validate we got enough frames
  if (captureBuffer.length < MIN_CAPTURE_FRAMES) {
    console.warn(
      `[Capture] Only got ${captureBuffer.length} valid frames (need ${MIN_CAPTURE_FRAMES})`,
    )
    showErrorToast(
      `Capture failed: only ${captureBuffer.length} valid frames detected. Ensure your face and shoulders are visible.`,
    )
    updateStatusDisplay('Capture failed \u2014 try again')
    captureBtn.disabled = false
    return null
  }

  // Average the collected landmarks
  const count = captureBuffer.length
  const averaged = {
    nose: { x: 0, y: 0, z: 0 },
    leftShoulder: { x: 0, y: 0, z: 0 },
    rightShoulder: { x: 0, y: 0, z: 0 },
  }

  for (const frame of captureBuffer) {
    averaged.nose.x += frame.nose.x
    averaged.nose.y += frame.nose.y
    averaged.nose.z += frame.nose.z ?? 0
    averaged.leftShoulder.x += frame.leftShoulder.x
    averaged.leftShoulder.y += frame.leftShoulder.y
    averaged.leftShoulder.z += frame.leftShoulder.z ?? 0
    averaged.rightShoulder.x += frame.rightShoulder.x
    averaged.rightShoulder.y += frame.rightShoulder.y
    averaged.rightShoulder.z += frame.rightShoulder.z ?? 0
  }

  const nose: Landmark = {
    x: averaged.nose.x / count,
    y: averaged.nose.y / count,
    z: averaged.nose.z / count,
  }
  const leftShoulder: Landmark = {
    x: averaged.leftShoulder.x / count,
    y: averaged.leftShoulder.y / count,
    z: averaged.leftShoulder.z / count,
  }
  const rightShoulder: Landmark = {
    x: averaged.rightShoulder.x / count,
    y: averaged.rightShoulder.y / count,
    z: averaged.rightShoulder.z / count,
  }

  const ratio = calculateTriangleRatio(nose, leftShoulder, rightShoulder)

  const reference: ReferencePose = {
    nose,
    leftShoulder,
    rightShoulder,
    ratio,
    capturedAt: new Date().toISOString(),
  }

  try {
    await saveReference(reference)
    console.info(`[Capture] Reference saved \u2014 ratio: ${ratio.toFixed(4)}, frames: ${count}`)

    // Flash checkmark on canvas
    setCaptureOverlayText('\u2705')
    setTimeout(() => {
      setCaptureOverlayText('')
    }, 1500)

    updateStatusDisplay('Reference captured \u2014 ready to monitor')
    updateReferenceStatus(reference)
    captureBtn.disabled = false
    captureBtn.textContent = 'Recapture Pose'
    const updatedState = getDetectionState()
    syncStartButton(startBtn, updatedState.running, true)
    return reference
  } catch (error) {
    console.error('[Capture] Failed to save reference:', error)
    showErrorToast('Failed to save reference pose')
    updateStatusDisplay('Save failed \u2014 try again')
    captureBtn.disabled = false
    return null
  }
}
