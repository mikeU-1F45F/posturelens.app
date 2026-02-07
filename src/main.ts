// ShadowNudge - App Bootstrap & Orchestrator
// Wires together modules: capabilities, UI, canvas, capture, detection

import type { Results } from '@mediapipe/holistic'

import {
  drawBoundingBox,
  drawCaptureOverlay,
  drawShoulderTriangle,
} from './core/canvas-renderer.ts'
import {
  detectBrowserCapabilities,
  displayCapabilityWarning,
  displayMobileBlock,
} from './core/capabilities.ts'
import {
  captureReferencePose,
  extractTriangleLandmarks,
  getCaptureBuffer,
  getIsCapturing,
} from './core/capture.ts'
import { Detector } from './core/detector.ts'
import { clearAllData, loadReference, type ReferencePose } from './core/reference-store.ts'
import {
  hideProgress,
  showErrorToast,
  showProgress,
  showSuccessToast,
  syncStartButton,
  updateDetectionStatus,
  updateReferenceStatus,
  updateStatusDisplay,
} from './ui.ts'

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

let firstDetectionReceived = false
let detectionLoopRunning = false
let animationFrameId: number | null = null
let currentReference: ReferencePose | null = null

// ---------------------------------------------------------------------------
// Webcam
// ---------------------------------------------------------------------------

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

    const videoContainer = document.getElementById('video-container')
    if (videoContainer) {
      videoContainer.style.display = 'block'
    }

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

// ---------------------------------------------------------------------------
// Detection loop
// ---------------------------------------------------------------------------

function onDetectorResults(results: Results): void {
  if (!firstDetectionReceived) {
    firstDetectionReceived = true
    if (!getIsCapturing()) {
      updateStatusDisplay(
        currentReference ? 'Running' : 'Ready \u2014 capture a reference pose to begin',
      )
    }
    console.info('[ShadowNudge] First detection received')
  }

  const poseLandmarks = results.poseLandmarks?.length ?? 0
  const leftHandLandmarks = results.leftHandLandmarks?.length ?? 0
  const rightHandLandmarks = results.rightHandLandmarks?.length ?? 0
  const faceLandmarks = results.faceLandmarks?.length ?? 0

  console.debug(
    `[Detector] Landmarks - Pose: ${poseLandmarks}, Left Hand: ${leftHandLandmarks}, Right Hand: ${rightHandLandmarks}, Face: ${faceLandmarks}`,
  )

  // Collect triangle landmarks during capture
  if (getIsCapturing() && results.poseLandmarks) {
    const triangle = extractTriangleLandmarks(results.poseLandmarks)
    if (triangle) {
      getCaptureBuffer().push(triangle)
    }
  }

  // Update status labels
  updateDetectionStatus('pose', poseLandmarks > 0, '\uD83E\uDDCD')
  updateDetectionStatus('left-hand', leftHandLandmarks > 0, '\u270B')
  updateDetectionStatus('right-hand', rightHandLandmarks > 0, '\uD83E\uDD1A')
  updateDetectionStatus('face', faceLandmarks > 0, '\uD83D\uDE0A')

  // Draw detection overlays
  const canvas = document.getElementById('detection-canvas') as HTMLCanvasElement
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (results.poseLandmarks) drawShoulderTriangle(ctx, results.poseLandmarks)
  if (results.leftHandLandmarks) drawBoundingBox(ctx, results.leftHandLandmarks, '#ff4444')
  if (results.rightHandLandmarks) drawBoundingBox(ctx, results.rightHandLandmarks, '#ffaa00')
  if (results.faceLandmarks) drawBoundingBox(ctx, results.faceLandmarks, '#00aaff')

  drawCaptureOverlay(ctx)
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

  const stream = video.srcObject as MediaStream
  if (stream) {
    for (const track of stream.getTracks()) {
      track.stop()
    }
    video.srcObject = null
  }

  const videoContainer = document.getElementById('video-container')
  if (videoContainer) {
    videoContainer.style.display = 'none'
  }

  const canvas = document.getElementById('detection-canvas') as HTMLCanvasElement
  if (canvas) {
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  console.info('[ShadowNudge] Detection stopped, webcam released')
}

// ---------------------------------------------------------------------------
// App init
// ---------------------------------------------------------------------------

async function initializeApp(): Promise<void> {
  const capabilities = detectBrowserCapabilities()
  console.debug('[ShadowNudge] Browser capabilities:', capabilities)

  if (capabilities.mobile) {
    console.error('[ShadowNudge] Mobile device detected - blocking')
    displayMobileBlock()
    return
  }

  const missingCapabilities: string[] = []
  if (!capabilities.webgpu) missingCapabilities.push('WebGPU')
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
    if (missingCapabilities.includes('WASM')) {
      displayCapabilityWarning(missingCapabilities)
    }
  } else {
    console.debug('[ShadowNudge] All capabilities supported')
  }

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

    // Load existing reference pose
    const existingRef = await loadReference()
    currentReference = existingRef
    updateReferenceStatus(existingRef)

    const captureBtn = document.getElementById('capture-btn') as HTMLButtonElement
    const startBtn = document.getElementById('start-btn') as HTMLButtonElement

    if (existingRef) {
      console.info(
        `[ShadowNudge] Existing reference loaded (ratio: ${existingRef.ratio.toFixed(4)})`,
      )
      updateStatusDisplay('Reference pose loaded \u2014 ready to monitor')
      if (captureBtn) {
        captureBtn.disabled = false
        captureBtn.textContent = 'Recapture Pose'
      }
      if (startBtn) syncStartButton(startBtn, detectionLoopRunning, !!currentReference)
    } else {
      console.info('[ShadowNudge] No reference found \u2014 capture required')
      updateStatusDisplay('Capture a reference pose to begin')
      if (captureBtn) captureBtn.disabled = false
      if (startBtn) syncStartButton(startBtn, detectionLoopRunning, !!currentReference)
    }

    console.info('[ShadowNudge] App initialized successfully')

    // Wire capture button
    if (captureBtn && startBtn) {
      captureBtn.addEventListener('click', async () => {
        const ref = await captureReferencePose(
          captureBtn,
          startBtn,
          async () => {
            updateStatusDisplay('Starting webcam...')
            const newVideo = await setupWebcam()
            firstDetectionReceived = false
            await startDetection(detector, newVideo)
          },
          () => ({ running: detectionLoopRunning, currentReference }),
        )
        if (ref) currentReference = ref
      })
    }

    // Wire start/stop button
    if (startBtn) {
      startBtn.addEventListener('click', async () => {
        if (detectionLoopRunning) {
          stopDetection(video)
          updateStatusDisplay('Stopped \u2014 camera off')
          syncStartButton(startBtn, detectionLoopRunning, !!currentReference)
        } else {
          try {
            updateStatusDisplay('Restarting webcam...')
            const newVideo = await setupWebcam()
            updateStatusDisplay('Initializing detection...')
            await startDetection(detector, newVideo)
            syncStartButton(startBtn, detectionLoopRunning, !!currentReference)
          } catch (error) {
            console.error('[ShadowNudge] Failed to restart monitoring:', error)
            showErrorToast('Failed to restart webcam')
            updateStatusDisplay('Stopped \u2014 camera off')
          }
        }
      })
    }

    // Wire clear data link
    const clearLink = document.getElementById('clear-data-link')
    if (clearLink) {
      clearLink.addEventListener('click', async (e) => {
        e.preventDefault()
        try {
          if (detectionLoopRunning) stopDetection(video)
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
