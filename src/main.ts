// PostureLens - App Bootstrap & Orchestrator
// Wires together modules: capabilities, UI, canvas, capture, detection
// This is the entry point that initializes the posture monitoring application

import type { Results } from '@mediapipe/holistic'
import { AlertEngine } from './core/alert-engine.ts'
import {
  drawBoundingBox,
  drawCaptureOverlay,
  drawShoulderTriangle,
  setCaptureOverlayText,
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
import { PostureDeviation } from './core/posture.ts'
import { HandFaceProximity } from './core/proximity.ts'
import { clearAllData, loadReference, type ReferencePose } from './core/reference-store.ts'
import {
  hideProgress,
  resetDetectionStatus,
  showAlertToast,
  showErrorToast,
  showProgress,
  showSuccessToast,
  showUpdatePrompt,
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

/** Cached detection canvas context (queried once in initializeApp, used every frame) */
let detectionCtx: CanvasRenderingContext2D | null = null

let modelSwitchPending = false
let modelSwitchOverlayTimeoutId: number | null = null
let onModelSwitchFirstResult: (() => void) | null = null

// ---------------------------------------------------------------------------
// Alerts (shared mechanisms)
// ---------------------------------------------------------------------------

type SensitivityLevel = 'low' | 'medium' | 'high'

const STORAGE_KEY_FACE_TOUCH_SENS = 'posturelens.sensitivity.faceTouch'
const STORAGE_KEY_POSTURE_SENS = 'posturelens.sensitivity.posture'

let alertEngine: AlertEngine | null = null
let handFaceProximity = new HandFaceProximity()
let postureDeviation = new PostureDeviation()

let _handsNearFaceAlertCount = 0
let _postureAlertCount = 0

function parseSensitivityLevel(value: string | null): SensitivityLevel {
  if (value === 'low' || value === 'medium' || value === 'high') return value
  return 'medium'
}

function createHandFaceProximity(level: SensitivityLevel): HandFaceProximity {
  switch (level) {
    case 'high':
      return new HandFaceProximity({
        framesToTrigger: 2,
        normalizedDistanceThreshold: 0.25,
        zDistanceThreshold: 0.14,
      })
    case 'low':
      return new HandFaceProximity({
        framesToTrigger: 4,
        normalizedDistanceThreshold: 0.12,
        zDistanceThreshold: 0.1,
      })
    default:
      return new HandFaceProximity({
        framesToTrigger: 3,
        normalizedDistanceThreshold: 0.18,
        zDistanceThreshold: 0.12,
      })
  }
}

function createPostureDeviation(level: SensitivityLevel): PostureDeviation {
  switch (level) {
    case 'high':
      return new PostureDeviation({
        framesToTrigger: 3,
        ratioDropThreshold: 0.05,
      })
    case 'low':
      return new PostureDeviation({
        framesToTrigger: 5,
        ratioDropThreshold: 0.1,
      })
    default:
      return new PostureDeviation({
        framesToTrigger: 4,
        ratioDropThreshold: 0.07,
      })
  }
}

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

    console.info('[PostureLens] Webcam stream acquired')
    return videoPreview
  } catch (error) {
    console.error('[PostureLens] Webcam access failed:', error)
    throw new Error('Failed to access webcam. Please grant camera permissions.')
  }
}

// ---------------------------------------------------------------------------
// Detection loop
// ---------------------------------------------------------------------------

function onDetectorResults(results: Results): void {
  if (modelSwitchPending) {
    modelSwitchPending = false
    if (modelSwitchOverlayTimeoutId !== null) {
      clearTimeout(modelSwitchOverlayTimeoutId)
      modelSwitchOverlayTimeoutId = null
    }

    setCaptureOverlayText('')

    const cb = onModelSwitchFirstResult
    onModelSwitchFirstResult = null
    cb?.()
  }

  if (!firstDetectionReceived) {
    firstDetectionReceived = true
    if (!getIsCapturing()) {
      updateStatusDisplay(
        currentReference ? 'Running' : 'Ready \u2014 capture a reference pose to begin',
      )
    }
    console.info('[PostureLens] First detection received')
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

  // Alerts are active when we are not capturing.
  // Hands-near-face does not require a reference.
  if (!getIsCapturing() && alertEngine && !modelSwitchPending) {
    // Hands-near-face is higher priority than posture, but we still update posture state
    // every frame so it can build streak/smoothing even while proximity is active.
    const proximityAlert = handFaceProximity.update(results)
    const postureAlert = currentReference
      ? postureDeviation.update(results, currentReference)
      : null

    if (proximityAlert) {
      const fired = alertEngine.trigger(proximityAlert.variant, proximityAlert.reason)
      if (fired) {
        _handsNearFaceAlertCount++
        handFaceProximity.acknowledge()
      }
    } else if (postureAlert) {
      const fired = alertEngine.trigger(postureAlert.variant, postureAlert.reason)
      if (fired) {
        _postureAlertCount++
        postureDeviation.acknowledge()
      }
    }
  }

  // Update status labels
  updateDetectionStatus('pose', poseLandmarks > 0, '\uD83E\uDDCD')
  updateDetectionStatus('left-hand', leftHandLandmarks > 0, '\u270B')
  updateDetectionStatus('right-hand', rightHandLandmarks > 0, '\uD83E\uDD1A')
  updateDetectionStatus('face', faceLandmarks > 0, '\uD83D\uDE0A')

  // Draw detection overlays
  if (!detectionCtx) return
  const ctx = detectionCtx

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

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

    try {
      if (video.readyState >= 2) {
        await detector.processFrame(video)
      }
    } catch (error) {
      // Transient errors can happen during model resets (e.g., toggling modelComplexity).
      console.warn('[PostureLens] Detector frame processing error:', error)
    }

    animationFrameId = requestAnimationFrame(processNextFrame)
  }
  animationFrameId = requestAnimationFrame(processNextFrame)
  console.info('[PostureLens] Detection loop started')
}

function showModelSwitchOverlay(message: string): void {
  // Reuse the capture overlay renderer (same canvas) for a transient message.
  setCaptureOverlayText(message)

  if (detectionCtx) {
    const ctx = detectionCtx
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    drawCaptureOverlay(ctx)
  }

  if (modelSwitchOverlayTimeoutId !== null) {
    clearTimeout(modelSwitchOverlayTimeoutId)
  }

  modelSwitchOverlayTimeoutId = window.setTimeout(() => {
    modelSwitchPending = false
    setCaptureOverlayText('')
    modelSwitchOverlayTimeoutId = null
  }, 4_000)
}

function stopDetection(video: HTMLVideoElement): void {
  detectionLoopRunning = false
  firstDetectionReceived = false

  handFaceProximity.reset()
  postureDeviation.reset()
  _handsNearFaceAlertCount = 0
  _postureAlertCount = 0

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

  if (detectionCtx) {
    detectionCtx.clearRect(0, 0, detectionCtx.canvas.width, detectionCtx.canvas.height)
  }

  resetDetectionStatus()
  console.info('[PostureLens] Detection stopped, webcam released')
}

// ---------------------------------------------------------------------------
// Service worker updates
// ---------------------------------------------------------------------------

let updatePromptDismissedThisSession = false
let updatePromptShownThisSession = false

async function requestServiceWorkerVersion(worker: ServiceWorker): Promise<string> {
  return new Promise((resolve) => {
    const channel = new MessageChannel()

    const timeoutId = window.setTimeout(() => {
      resolve('unknown')
    }, 1000)

    channel.port1.onmessage = (event) => {
      clearTimeout(timeoutId)

      const data = event.data as unknown
      if (data && typeof data === 'object') {
        const msg = data as { type?: string; version?: string }
        if (msg.type === 'SW_VERSION' && typeof msg.version === 'string') {
          resolve(msg.version)
          return
        }
      }

      resolve('unknown')
    }

    worker.postMessage({ type: 'GET_VERSION' }, [channel.port2])
  })
}

function setupServiceWorkerUpdatePrompt(): void {
  if (!('serviceWorker' in navigator)) return

  const maybeShowPrompt = async (reg: ServiceWorkerRegistration) => {
    if (updatePromptDismissedThisSession || updatePromptShownThisSession) return

    // Only prompt when there's a previously controlling SW and a new one is fully downloaded.
    if (!navigator.serviceWorker.controller) return

    const waiting = reg.waiting
    if (!waiting) return

    updatePromptShownThisSession = true
    const version = await requestServiceWorkerVersion(waiting)

    showUpdatePrompt(
      version,
      () => {
        // User accepted update: activate waiting worker and reload once it takes control.
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => {
            window.location.reload()
          },
          { once: true },
        )
        waiting.postMessage({ type: 'SKIP_WAITING' })
      },
      () => {
        // User declined update: suppress for this session.
        updatePromptDismissedThisSession = true
      },
    )
  }

  void (async () => {
    let reg: ServiceWorkerRegistration | undefined
    for (let attempt = 0; attempt < 10; attempt++) {
      reg = await navigator.serviceWorker.getRegistration()
      if (reg) break
      await new Promise((r) => setTimeout(r, 250))
    }
    if (!reg) return

    // If an update is already waiting when the page loads, prompt immediately.
    await maybeShowPrompt(reg)

    reg.addEventListener('updatefound', () => {
      const installing = reg.installing
      if (!installing) return

      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && reg.waiting) {
          void maybeShowPrompt(reg)
        }
      })
    })

    // Proactively check for updates on page load.
    try {
      await reg.update()
    } catch (error) {
      console.debug('[PostureLens] Service worker update check failed:', error)
    }
  })()
}

// ---------------------------------------------------------------------------
// Full pose model (optional)
// ---------------------------------------------------------------------------

type FullPoseModelCacheStatusMessage = {
  type: 'FULL_POSE_MODEL_CACHE_STATUS'
  cached: boolean
}

type FullPoseModelPrefetchCompleteMessage = {
  type: 'FULL_POSE_MODEL_PREFETCH_COMPLETE'
  ok: boolean
  cached: boolean
}

async function postMessageToServiceWorker(message: unknown): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false

  const reg = await navigator.serviceWorker.getRegistration()
  const target = reg?.active ?? reg?.waiting ?? reg?.installing
  if (!target) return false

  target.postMessage(message)
  return true
}

function setupFullPoseModelToggle(detector: Detector): void {
  const toggle = document.getElementById('full-model-toggle') as HTMLInputElement | null
  const status = document.getElementById('full-model-status')

  if (!toggle || !status) return

  const setUi = (text: string, opts?: { enableToggle?: boolean }) => {
    status.textContent = text
    if (opts?.enableToggle !== undefined) {
      toggle.disabled = !opts.enableToggle
    }
  }

  const renderReadyState = () => {
    if (toggle.checked) {
      setUi('Full model: enabled', { enableToggle: true })
    } else {
      setUi('Full model: ready (optional)', { enableToggle: true })
    }
  }

  let prefetchRequested = false

  // Keep user in full control: we only enable the toggle after the full model is cached.
  toggle.disabled = true
  toggle.checked = false
  setUi('Full model: checking…')

  if (!('serviceWorker' in navigator)) {
    setUi('Full model: unavailable (no service worker)')
    return
  }

  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data as unknown
    if (!data || typeof data !== 'object') return

    const msg = data as Partial<
      FullPoseModelCacheStatusMessage & FullPoseModelPrefetchCompleteMessage
    >

    if (msg.type === 'FULL_POSE_MODEL_CACHE_STATUS') {
      if (msg.cached) {
        renderReadyState()
      } else if (!prefetchRequested) {
        prefetchRequested = true
        setUi('Full model: downloading…', { enableToggle: false })
        void (async () => {
          const ok = await postMessageToServiceWorker({ type: 'PREFETCH_FULL_POSE_MODEL' })
          if (!ok) {
            setUi('Full model: unavailable (service worker not ready)', { enableToggle: false })
          }
        })()
      }

      return
    }

    if (msg.type === 'FULL_POSE_MODEL_PREFETCH_COMPLETE') {
      if (msg.ok && msg.cached) {
        renderReadyState()
      } else {
        setUi('Full model: download failed', { enableToggle: false })
      }
    }
  })

  toggle.addEventListener('change', () => {
    if (getIsCapturing()) {
      showErrorToast('Cannot switch model during capture')
      toggle.checked = false
      renderReadyState()
      return
    }

    const nextModelComplexity: 0 | 1 = toggle.checked ? 1 : 0

    // This is purely a user action; we show a transient overlay while MediaPipe resets.
    toggle.disabled = true
    modelSwitchPending = true
    showModelSwitchOverlay('Switching model...')

    onModelSwitchFirstResult = () => {
      toggle.disabled = false
      renderReadyState()
    }

    // This forces MediaPipe to fetch/override the correct pose model and reset.
    firstDetectionReceived = false

    try {
      detector.updateConfig({ modelComplexity: nextModelComplexity })
      showSuccessToast(nextModelComplexity === 1 ? 'Full model enabled' : 'Lite model enabled')
    } catch (error) {
      console.error('[PostureLens] Failed to switch model complexity:', error)
      showErrorToast('Failed to switch model')
      toggle.checked = false
      modelSwitchPending = false
      setCaptureOverlayText('')
      toggle.disabled = false
      renderReadyState()
    }
  })

  void (async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const ok = await postMessageToServiceWorker({ type: 'CHECK_FULL_POSE_MODEL_CACHE' })
      if (ok) return
      await new Promise((r) => setTimeout(r, 250))
    }

    setUi('Full model: unavailable (service worker not ready)', { enableToggle: false })
  })()
}

// ---------------------------------------------------------------------------
// App init
// ---------------------------------------------------------------------------

async function initializeApp(): Promise<void> {
  const capabilities = detectBrowserCapabilities()
  console.debug('[PostureLens] Browser capabilities:', capabilities)

  if (capabilities.mobile) {
    console.error('[PostureLens] Mobile device detected - blocking')
    displayMobileBlock()
    return
  }

  const missingCapabilities: string[] = []
  if (!capabilities.webgpu) missingCapabilities.push('WebGPU')
  if (!capabilities.wasm) {
    missingCapabilities.push('WASM')
  } else if (!capabilities.webgpu) {
    console.warn('[PostureLens] WebGPU unavailable, falling back to WASM')
  }
  if (!capabilities.offscreenCanvas) {
    console.warn('[PostureLens] OffscreenCanvas unavailable - ghost rendering disabled')
  }

  if (missingCapabilities.length > 0) {
    console.warn(`[PostureLens] Missing capabilities: ${missingCapabilities.join(', ')}`)
    if (missingCapabilities.includes('WASM')) {
      displayCapabilityWarning(missingCapabilities)
    }
  } else {
    console.debug('[PostureLens] All capabilities supported')
  }

  // Cache canvas reference (container is always in DOM)
  const detectionCanvas = document.getElementById('detection-canvas') as HTMLCanvasElement
  if (detectionCanvas) {
    detectionCanvas.width = 640
    detectionCanvas.height = 480
    detectionCtx = detectionCanvas.getContext('2d')
  }

  try {
    setupServiceWorkerUpdatePrompt()

    updateStatusDisplay('Initializing detector...')
    showProgress('First-time download: ~26MB (cached for future visits)', 10)

    const detector = new Detector({ modelComplexity: 0 })
    detector.onResults(onDetectorResults)

    alertEngine = new AlertEngine({ showToast: showAlertToast })

    // Sensitivity controls (persisted)
    const faceTouchSelect = document.getElementById(
      'face-touch-sensitivity',
    ) as HTMLSelectElement | null
    const postureSelect = document.getElementById('posture-sensitivity') as HTMLSelectElement | null

    const savedFaceTouch = parseSensitivityLevel(localStorage.getItem(STORAGE_KEY_FACE_TOUCH_SENS))
    const savedPosture = parseSensitivityLevel(localStorage.getItem(STORAGE_KEY_POSTURE_SENS))

    if (faceTouchSelect) faceTouchSelect.value = savedFaceTouch
    if (postureSelect) postureSelect.value = savedPosture

    handFaceProximity = createHandFaceProximity(savedFaceTouch)
    postureDeviation = createPostureDeviation(savedPosture)

    faceTouchSelect?.addEventListener('change', () => {
      const level = parseSensitivityLevel(faceTouchSelect.value)
      localStorage.setItem(STORAGE_KEY_FACE_TOUCH_SENS, level)
      handFaceProximity = createHandFaceProximity(level)
    })

    postureSelect?.addEventListener('change', () => {
      const level = parseSensitivityLevel(postureSelect.value)
      localStorage.setItem(STORAGE_KEY_POSTURE_SENS, level)
      postureDeviation = createPostureDeviation(level)
    })

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
    handFaceProximity.reset()
    postureDeviation.reset()
    updateReferenceStatus(existingRef)

    const captureBtn = document.getElementById('capture-btn') as HTMLButtonElement
    const startBtn = document.getElementById('start-btn') as HTMLButtonElement

    if (existingRef) {
      console.info(
        `[PostureLens] Existing reference loaded (ratio: ${existingRef.ratio.toFixed(4)})`,
      )
      updateStatusDisplay('Reference pose loaded \u2014 ready to monitor')
      if (captureBtn) {
        captureBtn.disabled = false
        captureBtn.textContent = 'Recapture Pose'
      }
      if (startBtn) syncStartButton(startBtn, detectionLoopRunning, !!currentReference)
    } else {
      console.info('[PostureLens] No reference found \u2014 capture required')
      updateStatusDisplay('Capture a reference pose to begin')
      if (captureBtn) captureBtn.disabled = false
      if (startBtn) syncStartButton(startBtn, detectionLoopRunning, !!currentReference)
    }

    console.info('[PostureLens] App initialized successfully')

    // After we're interactive on lite, asynchronously cache the full model and enable the user toggle.
    setupFullPoseModelToggle(detector)

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
        if (ref) {
          currentReference = ref
          handFaceProximity.reset()
          postureDeviation.reset()
        }
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
            console.error('[PostureLens] Failed to restart monitoring:', error)
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
          handFaceProximity.reset()
          postureDeviation.reset()
          _handsNearFaceAlertCount = 0
          _postureAlertCount = 0
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
          console.error('[PostureLens] Failed to clear data:', error)
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
    console.error('[PostureLens] Initialization failed:', error)
    updateStatusDisplay('Initialization failed')
    showErrorToast(error instanceof Error ? error.message : 'Unknown error occurred')
  }
}

console.info('[PostureLens] Loading...')
document.addEventListener('DOMContentLoaded', initializeApp)
