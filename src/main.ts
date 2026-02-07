// ShadowNudge - App Bootstrap
// Main entry point, initializes MediaPipe, sets up event listeners

import type { Results } from '@mediapipe/holistic'
import { Detector } from './core/detector.ts'
import {
  calculateTriangleRatio,
  clearAllData,
  type Landmark,
  loadReference,
  type ReferencePose,
  saveReference,
} from './core/reference-store.ts'

interface BrowserCapabilities {
  mobile: boolean
  webgpu: boolean
  wasm: boolean
  offscreenCanvas: boolean
}

function detectBrowserCapabilities(): BrowserCapabilities {
  const ua = navigator.userAgent.toLowerCase()
  const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(ua)

  const hasWebGpu = 'gpu' in navigator
  const hasWasm = typeof WebAssembly === 'object' && typeof WebAssembly.validate === 'function'
  const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined'

  return {
    mobile: isMobile,
    webgpu: hasWebGpu,
    wasm: hasWasm,
    offscreenCanvas: hasOffscreenCanvas,
  }
}

function displayMobileBlock(): void {
  const block = document.createElement('div')
  block.id = 'mobile-block'
  block.style.cssText = `
    position: fixed; top: 0; left: 0;
    width: 100%; height: 100%;
    background: #0a0a0a; color: #e0e0e0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    z-index: 9999; font-family: system-ui, -apple-system, sans-serif;
    padding: 2rem; text-align: center;
  `
  block.innerHTML = `
    <h1 style="margin-bottom: 1rem;">ShadowNudge</h1>
    <p style="max-width: 400px; line-height: 1.5;">
      This app requires a desktop or laptop computer with a webcam.
      Mobile devices are not supported for privacy and performance reasons.
    </p>
  `
  document.body.appendChild(block)
}

function displayCapabilityWarning(missing: string[]): void {
  const warning = document.createElement('div')
  warning.id = 'capability-warning'
  warning.style.cssText = `
    position: fixed; top: 1rem; right: 1rem;
    background: #f39c12; color: #000;
    padding: 1rem; border-radius: 4px;
    z-index: 1000; font-family: system-ui, -apple-system, sans-serif;
    max-width: 300px; font-size: 0.9rem;
  `
  warning.innerHTML = `
    <strong>⚠️ Browser Compatibility Warning</strong><br>
    Missing features: ${missing.join(', ')}<br>
    <small>Performance may be degraded.</small>
  `
  document.body.appendChild(warning)
  setTimeout(() => warning.remove(), 5000)
}

async function setupWebcam(): Promise<HTMLVideoElement> {
  const videoPreview = document.getElementById('video-preview') as HTMLVideoElement
  if (!videoPreview) {
    throw new Error('Video preview element not found')
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    })
    videoPreview.srcObject = stream

    // Show video container
    const videoContainer = document.getElementById('video-container')
    if (videoContainer) {
      videoContainer.style.display = 'block'
    }

    // Setup detection canvas
    const canvas = document.getElementById('detection-canvas') as HTMLCanvasElement
    if (canvas) {
      canvas.width = 640
      canvas.height = 480
    }

    console.info('[ShadowNudge] Webcam stream acquired')
    return videoPreview
  } catch (error) {
    console.error('[ShadowNudge] Webcam access failed:', error)
    throw new Error('Failed to access webcam. Please grant camera permissions.')
  }
}

function updateStatusDisplay(message: string): void {
  const statusElement = document.getElementById('status')
  if (statusElement) {
    statusElement.textContent = message
  }
}

function showProgress(message: string, percent?: number): void {
  const progressContainer = document.getElementById('progress-container')
  const progressFill = document.getElementById('progress-fill')
  const progressText = document.getElementById('progress-text')

  if (progressContainer && progressFill && progressText) {
    progressContainer.style.display = 'block'
    progressText.textContent = message
    if (percent !== undefined) {
      progressFill.style.width = `${percent}%`
    }
  }
}

function hideProgress(): void {
  const progressContainer = document.getElementById('progress-container')
  if (progressContainer) {
    progressContainer.style.display = 'none'
  }
}

function showErrorToast(message: string): void {
  const toast = document.getElementById('error-toast')
  if (toast) {
    toast.textContent = message
    toast.style.display = 'block'
    setTimeout(() => {
      toast.style.display = 'none'
    }, 5000)
  }
}

function showSuccessToast(message: string): void {
  const toast = document.getElementById('error-toast')
  if (toast) {
    toast.textContent = message
    toast.style.backgroundColor = '#00ff88'
    toast.style.color = '#0a0a0a'
    toast.style.display = 'block'
    setTimeout(() => {
      toast.style.display = 'none'
      toast.style.backgroundColor = ''
      toast.style.color = ''
    }, 3000)
  }
}

function drawBoundingBox(
  ctx: CanvasRenderingContext2D,
  landmarks: Array<{ x: number; y: number }>,
  color: string,
): void {
  if (!landmarks || landmarks.length === 0) return

  // Calculate bounding box
  let minX = 1,
    minY = 1,
    maxX = 0,
    maxY = 0
  for (const landmark of landmarks) {
    minX = Math.min(minX, landmark.x)
    minY = Math.min(minY, landmark.y)
    maxX = Math.max(maxX, landmark.x)
    maxY = Math.max(maxY, landmark.y)
  }

  // Convert to canvas coordinates
  const x = minX * ctx.canvas.width
  const y = minY * ctx.canvas.height
  const w = (maxX - minX) * ctx.canvas.width
  const h = (maxY - minY) * ctx.canvas.height

  // Draw box
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.strokeRect(x, y, w, h)
}

/**
 * Draws the shoulder triangle (nose → left shoulder → right shoulder) on the canvas.
 * This triangle is the primary visual indicator for shoulder rounding detection.
 * The ratio of shoulder_width / shoulder_midpoint_to_nose_distance serves as
 * a proxy metric for forward shoulder rounding (Z-axis foreshortening).
 */
function drawShoulderTriangle(
  ctx: CanvasRenderingContext2D,
  poseLandmarks: Array<{ x: number; y: number; z?: number }>,
): void {
  // Landmark indices: 0 = nose, 11 = left shoulder, 12 = right shoulder
  const nose = poseLandmarks[0]
  const leftShoulder = poseLandmarks[11]
  const rightShoulder = poseLandmarks[12]

  if (!nose || !leftShoulder || !rightShoulder) return

  const w = ctx.canvas.width
  const h = ctx.canvas.height

  // Convert normalized coordinates to canvas pixels
  const noseX = nose.x * w
  const noseY = nose.y * h
  const lShoulderX = leftShoulder.x * w
  const lShoulderY = leftShoulder.y * h
  const rShoulderX = rightShoulder.x * w
  const rShoulderY = rightShoulder.y * h

  // Draw triangle
  ctx.beginPath()
  ctx.moveTo(noseX, noseY)
  ctx.lineTo(lShoulderX, lShoulderY)
  ctx.lineTo(rShoulderX, rShoulderY)
  ctx.closePath()

  ctx.strokeStyle = '#00ff88'
  ctx.lineWidth = 2
  ctx.stroke()

  // Semi-transparent fill for visibility
  ctx.fillStyle = 'rgba(0, 255, 136, 0.08)'
  ctx.fill()

  // Draw landmark dots
  const dotRadius = 4
  for (const [x, y] of [
    [noseX, noseY],
    [lShoulderX, lShoulderY],
    [rShoulderX, rShoulderY],
  ]) {
    ctx.beginPath()
    ctx.arc(x, y, dotRadius, 0, Math.PI * 2)
    ctx.fillStyle = '#00ff88'
    ctx.fill()
  }

  // Log Z-coordinates for depth analysis (secondary signal)
  if (nose.z !== undefined && leftShoulder.z !== undefined && rightShoulder.z !== undefined) {
    console.debug(
      `[Shoulder Z] nose: ${nose.z.toFixed(4)}, L: ${leftShoulder.z.toFixed(4)}, R: ${rightShoulder.z.toFixed(4)}`,
    )
  }
}

function updateDetectionStatus(label: string, detected: boolean, emoji: string): void {
  const statusElement = document.getElementById(`${label}-status`)
  if (statusElement) {
    statusElement.textContent = detected ? emoji : '✗'
    statusElement.style.color = detected ? '#00ff88' : '#ff4444'
  }
}

/** Tracks whether the first detection result has been received after starting */
let firstDetectionReceived = false

/** Capture state: when true, onDetectorResults collects triangle landmarks */
let isCapturing = false
/** Text overlay drawn on the detection canvas during capture (countdown, checkmark) */
let captureOverlayText = ''
const captureBuffer: Array<{ nose: Landmark; leftShoulder: Landmark; rightShoulder: Landmark }> = []

/** Currently loaded reference pose (null if none) */
let currentReference: ReferencePose | null = null

/**
 * Extracts triangle landmarks from pose results.
 * Returns null if any of the 3 required landmarks are missing.
 */
function extractTriangleLandmarks(
  poseLandmarks: Array<{ x: number; y: number; z?: number }>,
): { nose: Landmark; leftShoulder: Landmark; rightShoulder: Landmark } | null {
  const nose = poseLandmarks[0]
  const leftShoulder = poseLandmarks[11]
  const rightShoulder = poseLandmarks[12]

  if (!nose || !leftShoulder || !rightShoulder) return null

  return {
    nose: { x: nose.x, y: nose.y, z: nose.z },
    leftShoulder: { x: leftShoulder.x, y: leftShoulder.y, z: leftShoulder.z },
    rightShoulder: { x: rightShoulder.x, y: rightShoulder.y, z: rightShoulder.z },
  }
}

function onDetectorResults(results: Results): void {
  // Transition from "Initializing detection..." to "Running" on first result
  if (!firstDetectionReceived) {
    firstDetectionReceived = true
    // Only show "Running" if not in capture mode
    if (!isCapturing) {
      updateStatusDisplay(
        currentReference ? 'Running' : 'Ready — capture a reference pose to begin',
      )
    }
    console.info('[ShadowNudge] First detection received')
  }

  const poseLandmarks = results.poseLandmarks?.length ?? 0
  const leftHandLandmarks = results.leftHandLandmarks?.length ?? 0
  const rightHandLandmarks = results.rightHandLandmarks?.length ?? 0
  const faceLandmarks = results.faceLandmarks?.length ?? 0

  // Console logging for developers (debug-level because this can be very noisy)
  console.debug(
    `[Detector] Landmarks - Pose: ${poseLandmarks}, Left Hand: ${leftHandLandmarks}, Right Hand: ${rightHandLandmarks}, Face: ${faceLandmarks}`,
  )

  // Collect triangle landmarks during capture
  if (isCapturing && results.poseLandmarks) {
    const triangle = extractTriangleLandmarks(results.poseLandmarks)
    if (triangle) {
      captureBuffer.push(triangle)
    }
  }

  // Update status labels with emojis
  updateDetectionStatus('pose', poseLandmarks > 0, '🧍')
  updateDetectionStatus('left-hand', leftHandLandmarks > 0, '✋')
  updateDetectionStatus('right-hand', rightHandLandmarks > 0, '🤚')
  updateDetectionStatus('face', faceLandmarks > 0, '😊')

  // Draw detection overlays
  const canvas = document.getElementById('detection-canvas') as HTMLCanvasElement
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Draw shoulder triangle (replaces torso bounding box)
  if (results.poseLandmarks) {
    drawShoulderTriangle(ctx, results.poseLandmarks)
  }
  // Keep hand and face bounding boxes
  if (results.leftHandLandmarks) {
    drawBoundingBox(ctx, results.leftHandLandmarks, '#ff4444') // Red for left hand
  }
  if (results.rightHandLandmarks) {
    drawBoundingBox(ctx, results.rightHandLandmarks, '#ffaa00') // Orange for right hand
  }
  if (results.faceLandmarks) {
    drawBoundingBox(ctx, results.faceLandmarks, '#00aaff') // Blue for face
  }

  // Draw capture overlay text (countdown / checkmark) centered on canvas
  if (captureOverlayText) {
    const cx = canvas.width / 2
    const cy = canvas.height / 2

    // Dark backdrop pill for contrast
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
    const pillW = 140
    const pillH = 130
    const pillR = 20
    ctx.beginPath()
    ctx.roundRect(cx - pillW / 2, cy - pillH / 2, pillW, pillH, pillR)
    ctx.fill()

    // Text with stroke outline for extra pop
    ctx.font = 'bold 96px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)'
    ctx.lineWidth = 4
    ctx.strokeText(captureOverlayText, cx, cy)
    ctx.fillStyle = 'rgba(0, 255, 136, 0.95)'
    ctx.fillText(captureOverlayText, cx, cy)
  }
}

const MIN_CAPTURE_FRAMES = 10

/**
 * Runs a 3-second reference pose capture session.
 * Collects triangle landmarks each processed frame, averages them,
 * computes the ratio, and saves to IndexedDB.
 */
async function captureReferencePose(
  captureBtn: HTMLButtonElement,
  startBtn: HTMLButtonElement,
  detector: Detector,
): Promise<void> {
  captureBtn.disabled = true
  startBtn.disabled = true

  // Ensure webcam and detection are running before capture
  if (!detectionLoopRunning) {
    try {
      updateStatusDisplay('Starting webcam...')
      const newVideo = await setupWebcam()
      firstDetectionReceived = false
      await startDetection(detector, newVideo)
    } catch (error) {
      console.error('[Capture] Failed to start webcam:', error)
      showErrorToast('Failed to start webcam for capture')
      captureBtn.disabled = false
      return
    }
  }

  // Reset capture state
  captureBuffer.length = 0
  isCapturing = true

  // Countdown: 3... 2... 1...
  for (let i = 3; i > 0; i--) {
    captureOverlayText = String(i)
    updateStatusDisplay(`Hold good posture... ${i}`)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  // Capture for remaining duration (countdown already took 3s, but we start
  // collecting from the moment isCapturing was set)
  captureOverlayText = ''
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
    updateStatusDisplay('Capture failed — try again')
    captureBtn.disabled = false
    return
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
    currentReference = reference
    console.info(`[Capture] Reference saved — ratio: ${ratio.toFixed(4)}, frames: ${count}`)

    // Flash checkmark on canvas
    captureOverlayText = '✅'
    setTimeout(() => {
      captureOverlayText = ''
    }, 1500)

    updateStatusDisplay('Reference captured — ready to monitor')
    updateReferenceStatus(reference)
    captureBtn.disabled = false
    captureBtn.textContent = 'Recapture Pose'
    syncStartButton(startBtn)
  } catch (error) {
    console.error('[Capture] Failed to save reference:', error)
    showErrorToast('Failed to save reference pose')
    updateStatusDisplay('Save failed — try again')
    captureBtn.disabled = false
  }
}

/** Updates the reference status display in the UI */
function updateReferenceStatus(ref: ReferencePose | null): void {
  const refStatus = document.getElementById('reference-status')
  if (!refStatus) return

  if (ref) {
    const date = new Date(ref.capturedAt)
    const pad = (n: number) => String(n).padStart(2, '0')
    const dateTimeStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    refStatus.textContent = `Reference pose loaded (captured: ${dateTimeStr})`
    refStatus.style.color = '#00ff88'
  } else {
    refStatus.textContent = 'No reference pose \u2014 capture one to begin monitoring'
    refStatus.style.color = '#ffaa00'
  }
}

let detectionLoopRunning = false
let animationFrameId: number | null = null

/** Syncs the Start/Stop button label and disabled state with detection + reference state */
function syncStartButton(startBtn: HTMLButtonElement): void {
  if (detectionLoopRunning) {
    startBtn.textContent = 'Stop Monitoring'
    startBtn.disabled = !currentReference
  } else {
    startBtn.textContent = 'Start Monitoring'
    startBtn.disabled = !currentReference
  }
}

async function startDetection(detector: Detector, video: HTMLVideoElement): Promise<void> {
  if (detectionLoopRunning) return

  detectionLoopRunning = true
  const processNextFrame = async () => {
    if (!detectionLoopRunning) return

    if (video.readyState >= 2) {
      await detector.processFrame(video)
    }
    animationFrameId = requestAnimationFrame(processNextFrame)
  }
  animationFrameId = requestAnimationFrame(processNextFrame)
  console.info('[ShadowNudge] Detection loop started')
}

function stopDetection(video: HTMLVideoElement): void {
  detectionLoopRunning = false
  firstDetectionReceived = false
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }

  // Stop webcam stream
  const stream = video.srcObject as MediaStream
  if (stream) {
    for (const track of stream.getTracks()) {
      track.stop()
    }
    video.srcObject = null
  }

  // Hide video container
  const videoContainer = document.getElementById('video-container')
  if (videoContainer) {
    videoContainer.style.display = 'none'
  }

  // Clear detection canvas
  const canvas = document.getElementById('detection-canvas') as HTMLCanvasElement
  if (canvas) {
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }

  console.info('[ShadowNudge] Detection stopped, webcam released')
}

async function initializeApp(): Promise<void> {
  const capabilities = detectBrowserCapabilities()

  console.debug('[ShadowNudge] Browser capabilities:', capabilities)

  // Hard block on mobile devices
  if (capabilities.mobile) {
    console.error('[ShadowNudge] Mobile device detected - blocking')
    displayMobileBlock()
    return
  }

  // Warn but continue on missing capabilities
  const missingCapabilities: string[] = []
  if (!capabilities.webgpu) missingCapabilities.push('WebGPU')
  // WebGPU can fall back to WASM, so don't block if WASM is available
  if (!capabilities.wasm) {
    missingCapabilities.push('WASM')
  } else if (!capabilities.webgpu) {
    console.warn('[ShadowNudge] WebGPU unavailable, falling back to WASM')
  }
  if (!capabilities.offscreenCanvas) {
    console.warn('[ShadowNudge] OffscreenCanvas unavailable - ghost rendering disabled')
  }

  if (missingCapabilities.length > 0) {
    console.warn(`[ShadowNudge] Missing capabilities: ${missingCapabilities.join(', ')}`)
    // Only show warning if critical capabilities missing
    if (missingCapabilities.includes('WASM')) {
      displayCapabilityWarning(missingCapabilities)
    }
  } else {
    console.debug('[ShadowNudge] All capabilities supported')
  }

  // Initialize detector
  try {
    updateStatusDisplay('Initializing detector...')
    showProgress('First-time download: ~26MB (cached for future visits)', 10)

    const detector = new Detector({ modelComplexity: 0 })
    detector.onResults(onDetectorResults)

    updateStatusDisplay('Loading MediaPipe models...')
    showProgress('Downloading models and assets (one-time)', 30)
    await detector.loadModel()
    showProgress('Models loaded', 70)

    updateStatusDisplay('Setting up webcam...')
    showProgress('Requesting camera access', 80)
    const video = await setupWebcam()
    showProgress('Camera ready', 90)

    updateStatusDisplay('Initializing detection...')
    await startDetection(detector, video)

    hideProgress()

    // Check for existing reference pose
    const existingRef = await loadReference()
    currentReference = existingRef
    updateReferenceStatus(existingRef)

    const captureBtn = document.getElementById('capture-btn') as HTMLButtonElement
    const startBtn = document.getElementById('start-btn') as HTMLButtonElement

    if (existingRef) {
      console.info(
        `[ShadowNudge] Existing reference loaded (ratio: ${existingRef.ratio.toFixed(4)})`,
      )
      updateStatusDisplay('Reference pose loaded — ready to monitor')
      if (captureBtn) {
        captureBtn.disabled = false
        captureBtn.textContent = 'Recapture Pose'
      }
      if (startBtn) syncStartButton(startBtn)
    } else {
      console.info('[ShadowNudge] No reference found — capture required')
      updateStatusDisplay('Capture a reference pose to begin')
      if (captureBtn) {
        captureBtn.disabled = false
      }
      if (startBtn) syncStartButton(startBtn)
    }

    console.info('[ShadowNudge] App initialized successfully')

    // Wire up capture button
    if (captureBtn && startBtn) {
      captureBtn.addEventListener('click', () => {
        captureReferencePose(captureBtn, startBtn, detector)
      })
    }

    // Wire up start/stop button
    if (startBtn) {
      startBtn.addEventListener('click', async () => {
        if (detectionLoopRunning) {
          // Stop monitoring
          stopDetection(video)
          updateStatusDisplay('Stopped — camera off')
          syncStartButton(startBtn)
        } else {
          // Start monitoring
          try {
            updateStatusDisplay('Restarting webcam...')
            const newVideo = await setupWebcam()
            updateStatusDisplay('Initializing detection...')
            await startDetection(detector, newVideo)
            syncStartButton(startBtn)
          } catch (error) {
            console.error('[ShadowNudge] Failed to restart monitoring:', error)
            showErrorToast('Failed to restart webcam')
            updateStatusDisplay('Stopped — camera off')
          }
        }
      })
    }

    // Wire up clear data link
    const clearLink = document.getElementById('clear-data-link')
    if (clearLink) {
      clearLink.addEventListener('click', async (e) => {
        e.preventDefault()
        try {
          if (detectionLoopRunning) {
            stopDetection(video)
          }
          await clearAllData()
          currentReference = null
          updateReferenceStatus(null)
          updateStatusDisplay('All local data cleared')
          if (captureBtn) {
            captureBtn.disabled = false
            captureBtn.textContent = 'Capture Reference Pose'
          }
          if (startBtn) {
            startBtn.disabled = true
            startBtn.textContent = 'Start Monitoring'
          }
          showSuccessToast('All local data cleared')
        } catch (error) {
          console.error('[ShadowNudge] Failed to clear data:', error)
          showErrorToast('Failed to clear local data')
        }
      })
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      stopDetection(video)
      detector.cleanup()
    })
  } catch (error) {
    console.error('[ShadowNudge] Initialization failed:', error)
    updateStatusDisplay('Initialization failed')
    showErrorToast(error instanceof Error ? error.message : 'Unknown error occurred')
  }
}

console.info('[ShadowNudge] Loading...')
document.addEventListener('DOMContentLoaded', initializeApp)
