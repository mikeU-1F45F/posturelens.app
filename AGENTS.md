# ShadowNudge SDLC Architecture
**Version**: 0.1.0-MVP  
**Target**: Desktop/laptop browsers only (Chrome 90+)  
**Privacy**: Zero telemetry, pure local-first

## Project Structure

```
shadow-nudge/
├── public/                      # Static assets served by Cloudflare Pages
│   ├── models/                  # Pre-downloaded ML models (SW cached)
│   │   ├── holistic-lite.bin    # MediaPipe Holistic lite variant (~4MB)
│   │   └── holistic-full.bin    # Full accuracy variant (~12MB)
│   ├── sw.js                    # Service Worker (caching + semver)
│   └── index.html               # Single-page app shell
├── src/
│   ├── core/
│   │   ├── detector.ts          # MediaPipe Holistic inference wrapper
│   │   ├── reference-store.ts   # IndexedDB for pose snapshots
│   │   └── nudge-engine.ts      # Deviation detection & alert logic
│   ├── workers/
│   │   └── ghost-renderer.ts    # OffscreenCanvas ghost outline rendering
│   └── main.ts                  # App bootstrap, SW registration, mobile gate
├── wrangler.toml               # Cloudflare Pages deployment config
├── package.json                # Version drives SW updates
└── README.md
```

---

## Commit Conventions

Use Conventional Commits with a simple `type: message` format, no scope and no commit body.
Examples:
- `docs: first commit`
- `feat: add nudge engine`
- `fix: handle mobile user agent edge case`

## Core Technologies

### **MediaPipe Holistic (C++/WASM)**
**Why**: Runs pose (33 landmarks), hands (21 points each), and face mesh tracking at 60-90 FPS entirely in-browser. The WASM binary is compiled from C++ source, not TypeScript or Rust. While Rust wrappers exist (e.g., WasmEdge/mediapipe-rs), MediaPipe's official JavaScript API uses a custom C++ WASM binary for maximum performance.

**Implementation**:
```typescript
import { Holistic } from '@mediapipe/holistic';

const holistic = new Holistic({
  locateFile: (file) => `/models/${file}` // Host locally, bypass CDN
});

holistic.setOptions({
  modelComplexity: 1,        // 0=lite, 1=full, 2=heavy (start with 1)
  delegate: 'GPU',          // Chrome 113+: WebGPU | Fallback: WASM
  smoothLandmarks: true      // Reduces jitter, crucial for long sessions
});
```

**WASM Backend**: Chrome 90+, Edge 90+, Firefox 88+. Safari 15+ supports WASM but MediaPipe WebGPU requires Chrome/Edge.

### **WebGPU Acceleration (Chrome 113+ Required)**
- **Performance**: 3-10x faster inference vs WASM by offloading model execution to GPU compute shaders
- **Fallback**: Automatically degrades to WASM if WebGPU unavailable
- **Resource Impact**: GPU memory ~100-200MB persistent allocation; negligible CPU usage once initialized

### **OffscreenCanvas for Ghost Rendering**
Move ghost outline drawing to a dedicated worker thread to avoid blocking main UI during long monitoring sessions:

```typescript
// In main.ts
const canvas = document.querySelector('canvas');
const offscreen = canvas.transferControlToOffscreen();
const worker = new Worker('./workers/ghost-renderer.ts', { type: 'module' });
worker.postMessage({ canvas: offscreen }, [offscreen]);

// In ghost-renderer.ts
self.onmessage = (event) => {
  const canvas = event.data.canvas;
  const ctx = canvas.getContext('2d');
  // Render ghost outline here, decoupled from main thread
};
```

---

## Performance & Resource Management

### **Long-Running Session Optimizations**

1. **Frame Decimation**: Process every 3rd frame (90ms interval). Human posture changes slower than 110ms reaction time; this reduces GPU/CPU load by 66%.

2. **Model Complexity Runtime Toggle**:
   ```typescript
   // Later UI setting: accuracy vs. performance
   function setModelLevel(level: 0 | 1 | 2) {
     holistic.setOptions({ modelComplexity: level });
     // 0=Lite (4MB, 30 FPS), 1=Full (8MB, 45 FPS), 2=Heavy (12MB, 60 FPS)
   }
   ```

3. **GPU Memory Leak Prevention**: Call `holistic.close()` on page unload to release WebGPU textures. Chrome's Graphics Memory footprint can grow unbounded otherwise.

4. **Worker Thread Isolation**: MediaPipe inference runs on main thread (WebGPU requires it), but all ghost rendering, alert logic, and IndexedDB writes happen in workers.

5. **Battery API Throttling**: When `navigator.getBattery().level < 0.2`, auto-switch to `modelComplexity: 0` and 5-second frame intervals.

### **Initialization Overhead**
- First load: ~30s model download + WASM compilation (Chrome freezes briefly). Service Worker caches this aggressively.
- Subsequent loads: <2s from cache. WebGPU context initialization adds ~500ms.

---

## Data Flow

```mermaid
sequenceDiagram
    participant User
    participant Camera as getUserMedia()
    participant Holistic as MediaPipe Holistic
    participant Engine as NudgeEngine
    participant Worker as GhostRenderer Worker
    participant SW as Service Worker

    User->>Camera: Start webcam
    Camera->>Holistic: videoFrame (RGB)
    Note over Holistic: WebGPU/WASM inference<br/>every 3 frames
    
    Holistic->>Engine: landmarks (pose, hands, face)
    Engine->>Engine: Calc deviation vs. reference
    
    alt Deviation > threshold
        Engine->>Worker: drawGhost(landmarks)
        Engine->>User: flash backdrop + beep
    end
    
    alt New version detected
        SW->>User: Toast "Reload for v0.2.0?"
    end
```

---

## Mobile Detection (Hard Gate)

```typescript
// src/main.ts - Run before ANY asset loading
const isMobile = /mobi|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
  navigator.userAgent.toLowerCase()
);

if (isMobile) {
  document.body.innerHTML = `
    <div class="mobile-block">
      <h1>ShadowNudge requires a stable webcam</h1>
      <p>Desktop/laptop only. Mobile devices not supported.</p>
      <small>Mobile user agent detected: ${navigator.userAgent}</small>
    </div>
  `;
  throw new Error('Mobile device blocked');
}
```
MDN recommends this UA substring check as most reliable client-side method.

---

## Service Worker & Version Management

```javascript
// public/sw.js
const PACKAGE_VERSION = '__PACKAGE_VERSION__'; // Replaced at build time

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(`shadow-nudge-v${PACKAGE_VERSION}`).then(cache => 
      cache.addAll([
        '/',
        '/main.js',
        '/models/holistic-lite.bin'
      ])
    )
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      // Check version.json for updates
      if (event.request.url.endsWith('/package.json')) {
        return fetch(event.request).then(response => {
          // Post message to client if version mismatch
        });
      }
      return cached || fetch(event.request);
    })
  );
});
```

**Version Bump Workflow**:
1. Update `package.json` version field
2. Push to GitHub → Cloudflare Pages auto-builds
3. On next visit, SW fetches `package.json`, detects mismatch, shows toast
4. User accepts → `window.location.reload(true)` loads new SW cache

---

## Development Workflow

### **Local Development**
```bash
# Terminal 1: Serve with local IP for phone testing
wrangler pages dev --ip 192.168.1.x

# Terminal 2: Watch TypeScript
tsc --watch --noEmit

# Test mobile block: Open phone browser to http://192.168.1.x:8788
```

### **JavaScript runtime (Bun)**
Use Bun as the JavaScript runtime and testing framework for any tooling defined in `package.json`:
```bash
bun install
bun run <script-name>
bun test                    # Run test suite
bun test --watch           # Watch mode for development
```
Replace `<script-name>` with the appropriate script from `package.json` (for example, `dev`, `build`, or `test`).

### **HTMX for MVP UI**
**Decision**: Use HTMX (https://htmx.org/) for the MVP/prototype UI. This provides a minimal JavaScript approach while maintaining interactivity.
- **Rationale**: Faster development, smaller bundle, simpler state management for initial release
- **Migration path**: May migrate to vanilla JS in v0.2.0 if performance bottlenecks emerge
- **Alternative considered**: Vanilla JS from start, but HTMX accelerates prototype phase

### **Version Management & Semver**
Follow SemVer 2.0.0 for releases. MVP phase targets 0.x.x versions:
- **0.1.0**: Initial MVP release (7-week roadmap)
- **0.2.x+**: Feature enhancements based on user feedback
- **1.0.0**: Production-ready with full test coverage and stability guarantees

**Version Warning**: Any breaking changes to the API or data format require minor version bump (0.1 → 0.2). Service worker version mismatch handling must respect this.

### **Accessibility Foundation**
Base level accessibility included in MVP:
- High contrast UI elements
- Keyboard navigation support (tab order, enter/space activation)
- ARIA labels for screen readers
- Announcement of alerts via ARIA live regions
- Full accessibility audit deferred to post-MVP (v0.2.x)

### **Hot Reload**
Add `?no-sw` query param to disable Service Worker during development: `http://localhost:8788/?no-sw`

---

## Browser Compatibility Matrix

| Feature | Chrome | Edge | Firefox | Safari |
|---------|--------|------|---------|--------|
| **MediaPipe WASM** | 90+ ✓ | 90+ ✓ | 88+ ✓ | 15+ ✓ |
| **WebGPU Backend** | 113+ ✓ | 113+ ✓ | 127+ ✓ (experimental) | 17+ ✗ (no WebGPU) |
| **OffscreenCanvas** | 69+ ✓ | 79+ ✓ | 105+ ✓ | 16.4+ ✓ |
| **getUserMedia** | 21+ ✓ | 12+ ✓ | 36+ ✓ | 11+ ✓ |

**Recommend**: Chrome 113+ for full WebGPU acceleration. Fallback to WASM-only in Firefox/Safari with performance warning.

---

## Version Warnings for Bleeding-Edge Technology

ShadowNudge uses modern browser APIs that may have limited support:

### **WebGPU (Chrome 113+, Edge 113+)**
- **Warning**: WebGPU is still maturing. Performance varies significantly by GPU vendor (Intel, AMD, NVIDIA).
- **User Impact**: Chrome may freeze briefly during model initialization.
- **Mitigation**: Graceful fallback to WASM backend maintains functionality with reduced performance.

### **OffscreenCanvas (Chrome 69+, Firefox 105+)**
- **Warning**: Firefox 105+ has incomplete OffscreenCanvas support in workers.
- **User Impact**: Ghost rendering may block main thread in some Firefox versions.
- **Mitigation**: Keep main inference on main thread; ghost rendering failure is non-critical.

### **MediaPipe WASM (Chrome 90+, Firefox 88+)**
- **Warning**: WASM compilation adds ~500ms-2s to initial load.
- **User Impact**: First visit has noticeable startup delay.
- **Mitigation**: Service Worker caching makes subsequent loads <2s.

### **WebGL Context Limits**
- **Warning**: Running multiple GPU-accelerated tabs may exhaust GPU memory.
- **User Impact**: Browser may crash or become unresponsive.
- **Mitigation**: Call `holistic.close()` on page unload; warn users in documentation.

**Policy**: Only mobile gate should hard-block. All other technology gaps should show warnings and degrade gracefully.

---

## Privacy-First Checklist

- ✅ No network requests after initial load (models hosted locally)
- ✅ No analytics, telemetry, or server-side logging
- ✅ IndexedDB data stays local (never synced)
- ✅ Camera feed processed in-memory, no frames stored
- ✅ Service Worker caches only static assets, no user data
- ✅ All diagnostic traces stay local in the browser console via `console.debug`, `console.info`, `console.warn`, and `console.error`

### Local debug logging for support

When users report issues, ask them to:
1. Open their browser DevTools console
2. Reproduce the problem
3. Copy/paste the `console.debug`/`info`/`warn`/`error` output into the bug report

This preserves zero-telemetry guarantees while still enabling rich, local-only traces.

---

## References

1. MediaPipe Holistic Overview: https://github.com/google/mediapipe/blob/master/docs/solutions/holistic.md
2. MediaPipe Web WASM Implementation Details: https://github.com/google-ai-edge/mediapipe/issues/1163
3. WebGPU Browser Support: https://web.dev/blog/webgpu-supported-major-browsers
4. WebGPU ML Workload Acceleration: https://blog.logrocket.com/webgpu-accelerate-ml-workloads-browser
5. Chrome WebGPU + WASM Enhancements: https://developer.chrome.com/blog/io24-webassembly-webgpu-1
6. MediaPipe Slow Initialization Issue: https://github.com/google/mediapipe/issues/4348
7. MediaPipe C++ Source: https://github.com/google-ai-edge/mediapipe
8. MDN OffscreenCanvas API: https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas
9. Mobile UA Detection Best Practice: https://developer.mozilla.org/en-US/docs/Web/HTTP/Browser_detection_using_the_user_agent

---

## Implementation Roadmap

1. **Week 1**: Scaffold repo, mobile gate, Service Worker
2. **Week 2**: MediaPipe Holistic integration with WebGPU detection
3. **Week 3**: Reference pose capture & IndexedDB storage
4. **Week 4**: Hand-face proximity detection (priority feature) + basic deviation detection
5. **Week 5**: Ghost rendering worker + visual alerts (backdrop flash)
6. **Week 6**: Settings panel (sensitivity, model level)
7. **Week 7**: Stress testing & battery API integration

**Critical Path**: WebGPU backend selection and graceful degradation is highest risk. Test on Intel/AMD/NVIDIA GPUs—WebGPU drivers vary.
