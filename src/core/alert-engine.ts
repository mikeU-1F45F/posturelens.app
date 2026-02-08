// Alert Engine - Centralized alerting (toast + flash + beep) with global cooldown.
// Used by both "hands near face" and posture deviation detection.

type AlertVariant = 'normal' | 'low-confidence'

export type AlertEngineOptions = {
  /** Override hostname detection for testing. Defaults to window.location.hostname. */
  hostname?: string

  /** Called for normal-confidence alerts only. */
  showToast?: (message: string) => void

  /**
   * Cooldown in milliseconds.
   * If omitted, uses 60s in prod and 5s on localhost (dev).
   */
  cooldownMs?: number

  /** Visual flash duration in ms (class removal). */
  flashMs?: number
}

export class AlertEngine {
  private readonly hostname: string
  private readonly showToast: (message: string) => void
  private readonly cooldownMs: number
  private readonly flashMs: number

  private lastAlertAtMs = 0

  private audioCtx: AudioContext | null = null

  constructor(opts: AlertEngineOptions = {}) {
    this.hostname = opts.hostname ?? window.location.hostname

    const isDevHost = this.hostname === 'localhost' || this.hostname === '127.0.0.1'
    this.cooldownMs = opts.cooldownMs ?? (isDevHost ? 5_000 : 60_000)

    this.flashMs = opts.flashMs ?? 650

    this.showToast = opts.showToast ?? (() => {})
  }

  /** Returns true if we fired an alert (was not suppressed by cooldown). */
  public trigger(variant: AlertVariant, reason: string): boolean {
    const now = Date.now()
    if (now - this.lastAlertAtMs < this.cooldownMs) return false
    this.lastAlertAtMs = now

    if (variant === 'normal') {
      this.flash('red')
      this.showToast(reason)
      void this.beep()
      return true
    }

    // Low confidence: yellow flash only (no audio, no toast).
    this.flash('yellow')
    return true
  }

  private flash(color: 'red' | 'yellow'): void {
    const cls = color === 'red' ? 'alert-flash--red' : 'alert-flash--yellow'

    // Restart animation reliably.
    document.body.classList.remove('alert-flash--red', 'alert-flash--yellow')
    void document.body.offsetWidth
    document.body.classList.add(cls)

    window.setTimeout(() => {
      document.body.classList.remove(cls)
    }, this.flashMs)
  }

  private async beep(): Promise<void> {
    try {
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextCtor) return

      if (!this.audioCtx) {
        this.audioCtx = new AudioContextCtor()
      }

      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume()
      }

      const ctx = this.audioCtx
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      // A short, non-jarring beep.
      osc.type = 'sine'
      osc.frequency.value = 880

      // Avoid clicks: quick ramp up/down.
      const now = ctx.currentTime
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 0.13)

      osc.onended = () => {
        osc.disconnect()
        gain.disconnect()
      }
    } catch {
      // Ignore audio failures (autoplay policies, etc.)
    }
  }
}
