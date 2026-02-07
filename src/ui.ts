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

  if (progressContainer && progressFill && progressText) {
    progressContainer.style.display = 'block'
    progressText.textContent = message
    if (percent !== undefined) {
      progressFill.style.width = `${percent}%`
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

/** Shows a red error toast for 5 seconds */
export function showErrorToast(message: string): void {
  const toast = document.getElementById('error-toast')
  if (toast) {
    toast.textContent = message
    toast.style.display = 'block'
    setTimeout(() => {
      toast.style.display = 'none'
    }, 5000)
  }
}

/** Shows a green success toast for 3 seconds */
export function showSuccessToast(message: string): void {
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

/** Updates a detection status label (pose, left-hand, right-hand, face) */
export function updateDetectionStatus(label: string, detected: boolean, emoji: string): void {
  const statusElement = document.getElementById(`${label}-status`)
  if (statusElement) {
    statusElement.textContent = detected ? emoji : '✗'
    statusElement.style.color = detected ? '#00ff88' : '#ff4444'
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
  if (detectionRunning) {
    startBtn.textContent = 'Stop Monitoring'
    startBtn.disabled = !hasReference
  } else {
    startBtn.textContent = 'Start Monitoring'
    startBtn.disabled = !hasReference
  }
}
