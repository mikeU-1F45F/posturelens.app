// Browser capability detection and compatibility warnings

export interface BrowserCapabilities {
  mobile: boolean
  webgpu: boolean
  wasm: boolean
  offscreenCanvas: boolean
}

/** Detects browser capabilities for MediaPipe requirements */
export function detectBrowserCapabilities(): BrowserCapabilities {
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

/** Displays a full-page block for mobile devices */
export function displayMobileBlock(): void {
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

/** Displays a temporary warning toast for missing browser capabilities */
export function displayCapabilityWarning(missing: string[]): void {
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
