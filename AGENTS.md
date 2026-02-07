# ShadowNudge Architecture Guide

**Version**: 0.1.0-MVP  
**Target**: Desktop/laptop browsers only (Chrome 90+)  
**Privacy**: Zero telemetry, pure local-first  
**Dev Approach**: TypeScript-first, no testing framework (LSP-driven development)  
**Philosophy**: Make it work. Make it good. Make it performant.

## Project Structure

- **`public/`** - Static assets (models, service worker, HTML)
  - `models/` - Local MediaPipe model binaries
  - `sw.js` - Service worker for caching and versioning
  - `index.html` - Single-page app shell
- **`src/`** - TypeScript source
  - `core/` - Core logic (detection, storage, nudge engine)
  - `workers/` - OffscreenCanvas rendering worker
  - `main.ts` - App bootstrap and orchestration
- **`package.json`** - Version drives service worker updates
- **`wrangler.jsonc`** - Cloudflare Pages deployment config (JSONC recommended by Cloudflare for new projects)

## Development & Deployment

**Local Development**: Bun runtime with `bun run dev` for dev server, `bun build` for production builds

**Deployment**: Cloudflare Pages (static hosting) via Wrangler CLI

**Review Workflow**: When pausing for review, always provide:
- Command(s) to start services: `bun run dev` on port 3000
- What to look for/verify in browser/console
- Expected behavior vs. error conditions

**Session Notes** (2026-02-05):
- User prefers to be in the loop during end-to-end testing
- When pausing, provide next instructions for starting services and what to verify
- Development philosophy documented: Make it work. Make it good. Make it performant.
- User prefers the development philosophy: Make it work, make it good, make it performant. This should be noted in the AGENTS.md file. The current working approach accepts the ~26 MB size for first-time download, but the UI should show a progress bar with a note indicating this is a first-time download.

**Commit Workflow**:
- Pause before committing to allow user review and approval
- User wants to stay connected to the commit process
- Present changes and commit message for approval before executing

## Core Technologies

**MediaPipe Holistic** - C++/WASM binary for pose, hands, and face mesh tracking. Runs at 60-90 FPS entirely in-browser with WebGPU acceleration (Chrome 113+) or WASM fallback.
- Loaded via script tag in HTML (`public/holistic.js`)
- Accessed through `window.Holistic` global object
- Models and loaders must be copied from node_modules to `public/models/`
- Required files: holistic.js, holistic.binarypb, *_loader.js, *_wasm_bin.js, *.wasm, *.tflite
- Total assets: ~26MB committed to repo for local-first operation

**OffscreenCanvas Worker** - Moves ghost rendering to background thread to avoid main thread blocking during long sessions.

## Performance & Resource Management

- **Frame Decimation**: Process every 3rd frame (~90ms) to reduce load by 66%
- **Model Complexity**: Runtime toggle between lite/full/heavy variants
- **GPU Memory**: Call cleanup on page unload to prevent leaks
- **Battery Throttling**: Auto-switch to lite mode when battery <20%

First load: ~30s for model download + WASM compilation. Subsequent loads: <2s from cache.

## Shoulder Rounding Detection Strategy

Detecting forward shoulder rounding from a front-facing 2D camera uses a **ratio-based metric** as a proxy for Z-axis (depth) movement:

- **Triangle landmarks**: Nose (0), Left Shoulder (11), Right Shoulder (12)
- **Primary metric**: `shoulder_width / shoulder_midpoint_to_nose_distance` — when shoulders round forward, apparent shoulder width narrows (foreshortening), decreasing the ratio vs. reference
- **Secondary signal**: Z-coordinate logging from MediaPipe (depth relative to hip midpoint) — noisier than X/Y but useful as reinforcement when averaged over frames
- **Head-tilt guard**: Track nose-to-shoulder-midpoint Y-delta separately to distinguish "head dropped" from "shoulders narrowed"
- The ratio stays proportionally stable across camera distances, making it robust for users who move closer/further

## Data Flow

1. Camera captures frames
2. MediaPipe processes every 3rd frame
3. Shoulder triangle drawn on canvas (nose → left shoulder → right shoulder)
4. NudgeEngine compares triangle ratio against reference pose
5. Worker renders ghost overlay (optional)
6. Visual/audio alerts trigger when thresholds exceeded

## Mobile Detection (Hard Gate)

UA substring detection blocks mobile devices before any asset loading. Mobile user agents show hard block page with explanation.

## Service Worker & Versioning

Service worker caches all static assets including models. Version is embedded from package.json at build time. On version mismatch, shows "Reload for vX.X.X?" toast.

## Asset Loading Strategy

**First-time Download**: ~26MB (MediaPipe WASM, models, assets)
- Accepted trade-off for local-first, offline-capable operation
- All assets cached by service worker after initial load
- Subsequent loads: <2s from cache
- UI shows progress indicator during first-time model loading

**Future optimization considerations** (post-MVP):
- Pose-only mode (skip hand/face tracking) for lighter initial load
- Progressive model loading (lite → full → heavy on-demand)
- Defer to "Make it work. Make it good. Make it performant." philosophy

## UI/UX Decisions

**Vanilla HTML/JS for MVP** - No frameworks. UI is minimal functional interface.

**Video Preview** - Show webcam feed with visual detection indicators:
- Live video feed displayed in UI
- **Shoulder triangle overlay**: Drawn between nose (landmark 0), left shoulder (11), and right shoulder (12) — replaces the torso bounding box
- Bounding box overlays for hands and face
- Detection status labels (right hand, left hand, pose skeleton, face)
- Provides visual feedback that MediaPipe is working correctly

**Capture Mode First** - App launches in reference pose capture mode on every load. Persistent toggle available to re-capture (e.g., after moving closer, lighting changes, clothing changes).

**Alert Behavior (MVP - Hard-Coded)**
- **Normal Deviation**: Short audio beep + background color flash, max 1 per minute
- **Low Confidence**: Yellow background flash only, no audio
- Configurability deferred to post-MVP

**Accessibility Foundation**
- High contrast UI
- Keyboard navigation
- ARIA labels and live regions for alerts
- Full audit deferred to v0.2.x

## Browser Compatibility

| Feature | Chrome | Edge | Firefox | Safari |
|---------|--------|------|---------|--------|
| MediaPipe WASM | 90+ | 90+ | 88+ | 15+ |
| WebGPU Backend | 113+ | 113+ | 127+ (exp) | ✗ |
| OffscreenCanvas | 69+ | 79+ | 105+ | 16.4+ |

Recommend Chrome 113+ for full WebGPU acceleration.

## Technology Warnings

**WebGPU**: Still maturing, performance varies by GPU vendor. Graceful WASM fallback.

**OffscreenCanvas**: Firefox worker support incomplete. Ghost rendering failure is non-critical.

**WASM Compilation**: ~500ms-2s startup delay on first visit. SW caching mitigates.

**GPU Memory**: Multiple GPU tabs may exhaust memory. Cleanup on unload.

## Privacy-First Checklist

- ✅ No network requests after initial load
- ✅ No telemetry or analytics
- ✅ IndexedDB stays local
- ✅ Camera frames processed in memory only
- ✅ Console-only debugging traces

## References

MediaPipe Holistic, WebGPU, OffscreenCanvas MDN docs. See inline comments for specific implementation patterns.

