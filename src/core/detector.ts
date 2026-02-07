// MediaPipe Holistic Detector Wrapper
// Handles model loading, inference, WebGPU/WASM detection

import type { Holistic as HolisticType, Results } from '@mediapipe/holistic'

// MediaPipe is loaded via script tag in HTML, available on window
declare global {
  interface Window {
    Holistic: new (config: { locateFile: (file: string) => string }) => HolisticType
  }
}

export interface DetectorConfig {
  modelComplexity?: 0 | 1 | 2 // 0: lite, 1: full, 2: heavy
  smoothLandmarks?: boolean
  minDetectionConfidence?: number
  minTrackingConfidence?: number
  enableSegmentation?: boolean
}

export interface DetectorCapabilities {
  webgpu: boolean
  wasm: boolean
}

export class Detector {
  private holistic: HolisticType | null = null
  private frameCount = 0
  private frameDecimation = 3 // Process every 3rd frame
  private config: Required<DetectorConfig>
  private capabilities: DetectorCapabilities
  private onResultsCallback: ((results: Results) => void) | null = null

  constructor(config: DetectorConfig = {}) {
    this.config = {
      modelComplexity: config.modelComplexity ?? 0,
      smoothLandmarks: config.smoothLandmarks ?? true,
      minDetectionConfidence: config.minDetectionConfidence ?? 0.5,
      minTrackingConfidence: config.minTrackingConfidence ?? 0.5,
      enableSegmentation: config.enableSegmentation ?? false,
    }

    this.capabilities = {
      webgpu: 'gpu' in navigator,
      wasm: typeof WebAssembly === 'object',
    }

    console.debug('[Detector] Initialized with config:', this.config)
    console.debug('[Detector] Capabilities:', this.capabilities)
  }

  async loadModel(): Promise<void> {
    if (!window.Holistic) {
      throw new Error(
        '[Detector] MediaPipe Holistic not loaded. Ensure holistic.js is loaded via script tag.',
      )
    }

    this.holistic = new window.Holistic({
      locateFile: (file: string) => {
        // Serve from local /models directory
        return `/models/${file}`
      },
    })

    this.holistic.setOptions({
      modelComplexity: this.config.modelComplexity,
      smoothLandmarks: this.config.smoothLandmarks,
      minDetectionConfidence: this.config.minDetectionConfidence,
      minTrackingConfidence: this.config.minTrackingConfidence,
      enableSegmentation: this.config.enableSegmentation,
    })

    if (this.onResultsCallback) {
      this.holistic.onResults(this.onResultsCallback)
    }

    console.info('[Detector] Model loaded successfully')
  }

  onResults(callback: (results: Results) => void): void {
    this.onResultsCallback = callback
    if (this.holistic) {
      this.holistic.onResults(callback)
    }
  }

  async processFrame(videoElement: HTMLVideoElement): Promise<void> {
    if (!this.holistic) {
      throw new Error('[Detector] Model not loaded. Call loadModel() first.')
    }

    // Frame decimation: only process every Nth frame
    this.frameCount++
    if (this.frameCount % this.frameDecimation !== 0) {
      return
    }

    await this.holistic.send({ image: videoElement })
  }

  updateConfig(config: Partial<DetectorConfig>): void {
    this.config = { ...this.config, ...config }

    if (this.holistic) {
      this.holistic.setOptions({
        modelComplexity: this.config.modelComplexity,
        smoothLandmarks: this.config.smoothLandmarks,
        minDetectionConfidence: this.config.minDetectionConfidence,
        minTrackingConfidence: this.config.minTrackingConfidence,
        enableSegmentation: this.config.enableSegmentation,
      })
      console.info('[Detector] Config updated:', this.config)
    }
  }

  setFrameDecimation(decimation: number): void {
    if (decimation < 1) {
      throw new Error('[Detector] Frame decimation must be >= 1')
    }
    this.frameDecimation = decimation
    console.info(`[Detector] Frame decimation set to: ${decimation}`)
  }

  getCapabilities(): DetectorCapabilities {
    return { ...this.capabilities }
  }

  async cleanup(): Promise<void> {
    if (this.holistic) {
      this.holistic.close()
      this.holistic = null
      console.info('[Detector] Cleanup complete')
    }
  }
}
