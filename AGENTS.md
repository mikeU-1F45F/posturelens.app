# ShadowNudge Architecture Guide

**Version**: 0.1.0-MVP  
**Target**: Desktop/laptop browsers only (Chrome 90+)  
**Privacy**: Zero telemetry, pure local-first  
**Dev Approach**: TypeScript-first, no testing framework (LSP-driven development)

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

## Core Technologies

**MediaPipe Holistic** - C++/WASM binary for pose, hands, and face mesh tracking. Runs at 60-90 FPS entirely in-browser with WebGPU acceleration (Chrome 113+) or WASM fallback.

**OffscreenCanvas Worker** - Moves ghost rendering to background thread to avoid main thread blocking during long sessions.

## Performance & Resource Management

- **Frame Decimation**: Process every 3rd frame (~90ms) to reduce load by 66%
- **Model Complexity**: Runtime toggle between lite/full/heavy variants
- **GPU Memory**: Call cleanup on page unload to prevent leaks
- **Battery Throttling**: Auto-switch to lite mode when battery <20%

First load: ~30s for model download + WASM compilation. Subsequent loads: <2s from cache.

## Data Flow

1. Camera captures frames
2. MediaPipe processes every 3rd frame
3. NudgeEngine compares against reference pose
4. Worker renders ghost overlay (optional)
5. Visual/audio alerts trigger when thresholds exceeded

## Mobile Detection (Hard Gate)

UA substring detection blocks mobile devices before any asset loading. Mobile user agents show hard block page with explanation.

## Service Worker & Versioning

Service worker caches all static assets including models. Version is embedded from package.json at build time. On version mismatch, shows "Reload for vX.X.X?" toast.

## UI/UX Decisions

**Vanilla HTML/JS for MVP** - No frameworks. UI is minimal functional interface.

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

