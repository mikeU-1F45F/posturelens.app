// UI helpers — status display, progress bar, toasts, detection status labels

import type { ReferencePose } from './core/reference-store.ts'

/** Updates the main status text */
export function updateStatusDisplay(message: string): void {
  const statusElement = document.getElementById('status')
  if (statusElement) {
    statusElement.textContent = message
  }
}

/** Shows the progress bar with a message and optional percentage */
export function showProgress(message: string, percent?: number): void {
  const progressContainer = document.getElementById('progress-container')
  const progressFill = document.getElementById('progress-fill')
  const progressText = document.getElementById('progress-text')
  const progressBar = progressFill?.parentElement

  if (progressContainer && progressFill && progressText) {
    progressContainer.style.display = 'block'
    progressText.textContent = message
    if (percent !== undefined) {
      progressFill.style.width = `${percent}%`
      progressBar?.setAttribute('aria-valuenow', String(percent))
    }
  }
}

/** Hides the progress bar */
export function hideProgress(): void {
  const progressContainer = document.getElementById('progress-container')
  if (progressContainer) {
    progressContainer.style.display = 'none'
  }
}

/** Shows a toast message with the given variant and auto-dismiss duration */
function showToast(message: string, variant: 'error' | 'success', durationMs: number): void {
  const toast = document.getElementById('toast')
  if (!toast) return

  toast.textContent = message
  toast.classList.remove('toast--error', 'toast--success')
  toast.classList.add(`toast--${variant}`, 'show')
  setTimeout(() => {
    toast.classList.remove('show')
  }, durationMs)
}

/** Shows a red error toast for 5 seconds */
export function showErrorToast(message: string): void {
  showToast(message, 'error', 5000)
}

/** Shows a green success toast for 3 seconds */
export function showSuccessToast(message: string): void {
  showToast(message, 'success', 3000)
}

/** Shows a red alert toast (hands near face, posture) for 4 seconds */
export function showAlertToast(message: string): void {
  showToast(message, 'error', 4000)
}

export function showUpdatePrompt(version: string, onYes: () => void, onNo: () => void): void {
  const toast = document.getElementById('update-toast')
  const text = document.getElementById('update-toast-text')
  const yesBtn = document.getElementById('update-toast-yes') as HTMLButtonElement | null
  const noBtn = document.getElementById('update-toast-no') as HTMLButtonElement | null

  if (!toast || !text || !yesBtn || !noBtn) return

  if (!version || version === 'unknown') {
    text.textContent = 'New version available. Reload?'
  } else {
    const v = version.startsWith('v') ? version : `v${version}`
    text.textContent = `New version available (${v}). Reload?`
  }
  toast.style.display = 'block'

  const cleanup = () => {
    toast.style.display = 'none'
  }

  const onYesClick = () => {
    cleanup()
    onYes()
  }

  const onNoClick = () => {
    cleanup()
    onNo()
  }

  yesBtn.addEventListener('click', onYesClick, { once: true })
  noBtn.addEventListener('click', onNoClick, { once: true })
}

/** Updates a detection status label (pose, left-hand, right-hand, face) */
export function updateDetectionStatus(label: string, detected: boolean, emoji: string): void {
  const statusElement = document.getElementById(`${label}-status`)
  if (statusElement) {
    statusElement.textContent = detected ? emoji : '✗'
    statusElement.style.color = detected ? '#00ff88' : '#ff4444'
  }
}

const DETECTION_LABELS = ['pose', 'left-hand', 'right-hand', 'face'] as const

/** Resets all detection status labels to their initial "-" state */
export function resetDetectionStatus(): void {
  for (const label of DETECTION_LABELS) {
    const el = document.getElementById(`${label}-status`)
    if (el) {
      el.textContent = '-'
      el.style.color = ''
    }
  }
}

/** Updates the reference status display with ISO date or "no reference" message */
export function updateReferenceStatus(ref: ReferencePose | null): void {
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

/** Syncs the Start/Stop button label and disabled state with detection + reference state */
export function syncStartButton(
  startBtn: HTMLButtonElement,
  detectionRunning: boolean,
  hasReference: boolean,
): void {
  startBtn.textContent = detectionRunning ? 'Stop Monitoring' : 'Start Monitoring'
  startBtn.disabled = !hasReference
}
