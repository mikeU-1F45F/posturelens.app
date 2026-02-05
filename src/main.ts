// ShadowNudge - App Bootstrap
// Main entry point, initializes MediaPipe, sets up event listeners

import type { Results } from '@mediapipe/holistic'
import { Detector } from './core/detector.ts'

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
  const video = document.createElement('video')
  video.width = 640
  video.height = 480
  video.autoplay = true
  video.playsInline = true

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    })
    video.srcObject = stream
    console.log('[ShadowNudge] Webcam stream acquired')
    return video
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

function onDetectorResults(results: Results): void {
  // TODO: Pass results to NudgeEngine for comparison
  // For now, just log landmark counts
  const poseLandmarks = results.poseLandmarks?.length ?? 0
  const leftHandLandmarks = results.leftHandLandmarks?.length ?? 0
  const rightHandLandmarks = results.rightHandLandmarks?.length ?? 0
  const faceLandmarks = results.faceLandmarks?.length ?? 0

  console.log(
    `[Detector] Landmarks - Pose: ${poseLandmarks}, Left Hand: ${leftHandLandmarks}, Right Hand: ${rightHandLandmarks}, Face: ${faceLandmarks}`,
  )
}

async function startDetection(detector: Detector, video: HTMLVideoElement): Promise<void> {
  const processNextFrame = async () => {
    if (video.readyState >= 2) {
      await detector.processFrame(video)
    }
    requestAnimationFrame(processNextFrame)
  }
  requestAnimationFrame(processNextFrame)
  console.log('[ShadowNudge] Detection loop started')
}

async function initializeApp(): Promise<void> {
  const capabilities = detectBrowserCapabilities()

  console.log('[ShadowNudge] Browser capabilities:', capabilities)

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
    console.log('[ShadowNudge] All capabilities supported')
  }

  // Initialize detector
  try {
    updateStatusDisplay('Initializing detector...')
    const detector = new Detector({ modelComplexity: 0 })
    detector.onResults(onDetectorResults)

    updateStatusDisplay('Loading MediaPipe model...')
    await detector.loadModel()

    updateStatusDisplay('Setting up webcam...')
    const video = await setupWebcam()

    updateStatusDisplay('Starting detection...')
    await startDetection(detector, video)

    updateStatusDisplay('Running')
    console.log('[ShadowNudge] App initialized successfully')

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      detector.cleanup()
    })
  } catch (error) {
    console.error('[ShadowNudge] Initialization failed:', error)
    updateStatusDisplay('Initialization failed')
    showErrorToast(error instanceof Error ? error.message : 'Unknown error occurred')
  }
}

console.log('ShadowNudge loading...')
document.addEventListener('DOMContentLoaded', initializeApp)
