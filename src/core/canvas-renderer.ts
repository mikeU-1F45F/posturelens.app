// Canvas rendering — shoulder triangle, bounding boxes, capture overlay

import { LANDMARK_LEFT_SHOULDER, LANDMARK_NOSE, LANDMARK_RIGHT_SHOULDER } from './landmarks.ts'

/** Text overlay drawn on the detection canvas during capture (countdown, checkmark) */
let overlayText = ''

/** Gets the current overlay text */
export function getCaptureOverlayText(): string {
  return overlayText
}

/** Sets the overlay text displayed on the canvas (countdown numbers, checkmark) */
export function setCaptureOverlayText(text: string): void {
  overlayText = text
}

/** Draws a bounding box around a set of normalized landmarks */
export function drawBoundingBox(
  ctx: CanvasRenderingContext2D,
  landmarks: Array<{ x: number; y: number }>,
  color: string,
): void {
  if (!landmarks || landmarks.length === 0) return

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

  const x = minX * ctx.canvas.width
  const y = minY * ctx.canvas.height
  const w = (maxX - minX) * ctx.canvas.width
  const h = (maxY - minY) * ctx.canvas.height

  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.strokeRect(x, y, w, h)
}

/**
 * Draws the shoulder triangle (nose → left shoulder → right shoulder) on the canvas.
 * The ratio of shoulder_width / shoulder_midpoint_to_nose_distance serves as
 * a proxy metric for forward shoulder rounding (Z-axis foreshortening).
 */
export function drawShoulderTriangle(
  ctx: CanvasRenderingContext2D,
  poseLandmarks: Array<{ x: number; y: number; z?: number }>,
): void {
  const nose = poseLandmarks[LANDMARK_NOSE]
  const leftShoulder = poseLandmarks[LANDMARK_LEFT_SHOULDER]
  const rightShoulder = poseLandmarks[LANDMARK_RIGHT_SHOULDER]

  if (!nose || !leftShoulder || !rightShoulder) return

  const w = ctx.canvas.width
  const h = ctx.canvas.height

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

/** Draws the capture overlay (countdown number or checkmark) centered on canvas */
export function drawCaptureOverlay(ctx: CanvasRenderingContext2D): void {
  if (!overlayText) return

  const cx = ctx.canvas.width / 2
  const cy = ctx.canvas.height / 2

  // Dark backdrop pill for contrast
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  const pillW = 140
  const pillH = 130
  const pillR = 20
  ctx.beginPath()
  ctx.roundRect(cx - pillW / 2, cy - pillH / 2, pillW, pillH, pillR)
  ctx.fill()

  // Text with stroke outline for readability
  ctx.font = 'bold 96px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)'
  ctx.lineWidth = 4
  ctx.strokeText(overlayText, cx, cy)
  ctx.fillStyle = 'rgba(0, 255, 136, 0.95)'
  ctx.fillText(overlayText, cx, cy)
}
