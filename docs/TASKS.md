# PostureLens Development Tasks & Milestones

**Version**: 0.1.0-MVP  
**Last Updated**: 2026-02-08

---

All tasks designed for 1-2 hour side-hustle sessions. Target: Single developer workflow - one branch, incremental commits, no testing framework.

**Implementation Decisions (Locked)**
- **Dev Server**: Bun built-in dev server, serves `public/` on port 3000
- **Build Tool**: `bun build` (sufficient for static app, no complex bundling needed)
- **Service Worker**: Hand-written (no Workbox/SW tooling) - simple precaching only
- **TypeScript**: ES2022 target, ESNext modules, full strict mode
- **Models**: Start with pose landmark lite by default; allow full as an optional user toggle; defer heavy
- **CSS**: Vanilla CSS file in `public/` (no frameworks/preprocessors)
- **Audio**: Web Audio API programmatic beep (no audio files)
- **Error Handling**: Non-blocking UI notifications (console + visual toast)
- **Git**: Feature branches with PRs to main (no direct commits)
- **Code Quality**: **Biome** for linting/formatting (not built into Bun; added as dev dependency)
  - Scripts: `bun run format`, `bun run lint`, `bun run check`, `bun run precommit`
  - Config: biome.json + .biomeignore
  - Pre-commit: Run `bun run precommit` before commits (formats + checks)
- **Monorepo**: Single root `package.json` (no workspace setup)

## Phase 0: Foundation & Tooling

### 0.1 Repository Structure & Configuration
- [x] Initialize `package.json` with version 0.1.0
  - Add TypeScript config
  - Add dev script: `bun run dev` (port 3000, serves `/public`)
  - Add build script: `bun run build`
- [x] Create `public/` directory structure
- [x] Create `src/core/`, `src/workers/` directories
- [x] Download MediaPipe holistic-lite model (~4MB) to `public/models/`
- [x] Add `wrangler.jsonc` for Cloudflare Pages deployment
- [x] Create `.gitignore` (exclude build artifacts, node_modules)
- [x] Create `README.md` with quickstart

### 0.2 Development Tooling
- [x] Configure TypeScript (`tsconfig.json`)
  - Target: ES2022
  - Module: ESNext with bundler resolution
  - Strict: true (full strict mode)
  - Lib: DOM, DOM.Iterable, WebWorker, ES2022
- [x] Configure build pipeline (`bun build`)
  - Entry: `src/main.ts`
  - Output: `public/main.js`
  - Minify: true
- [x] Add development server config: `bun run dev` serves `public/` on port 3000
- **Note**: No testing framework - rely on TypeScript LSP only for MVP
- **Note**: Hand-write service worker (no Workbox) for simpler control
- **Runtime**: Bun for local dev, Cloudflare Pages for deployment

### 0.3 Core Project Files (Skeleton)
- [x] Create `src/main.ts` (empty shell with imports)
- [x] Create `public/index.html` (minimal vanilla JS shell)
- [x] Create `public/sw.js` (service worker skeleton)
- [x] Create placeholder files in `src/core/` and `src/workers/`

**Dependencies**: None  
**Outputs**: Working build pipeline, file structure

---

## Phase 1: Mobile Gate & MediaPipe Integration

### 1.1 Mobile Detection & Browser Warning
- [x] Implement UA detection in `src/main.ts` (block mobile)
- [x] Add browser capability detection (WebGPU, OffscreenCanvas, WASM)
- [x] Create warning UI for unsupported browsers (do not block, just warn)
- [x] Add console logging for debugging support issues

### 1.2 MediaPipe Integration Core
- [x] Install `@mediapipe/holistic` package
- [x] Create `src/core/detector.ts` wrapper class
- [x] Implement model loading from `/models/` directory
- [x] Add WebGPU detection and fallback logic
- [x] Implement frame decimation (every 3rd frame)

### 1.3 Model Management
- [x] Add `pose_landmark_full.tflite` (~6.4MB, modelComplexity: 1) to `public/models/`
- [x] Update service worker to precache core model assets and runtime-cache `/models/*`
- [x] Add model loading progress UI
- [x] Implement SW message-based prefetch of `pose_landmark_full.tflite` after app is interactive
- [x] Add user-controlled toggle (disabled until full model cached) to switch lite ↔ full

### 1.4 Video Preview & Detection Visualization
- [x] Add video element to display webcam feed
- [x] Add canvas overlay for drawing detection indicators
- [x] Display detection status labels (pose skeleton, left hand, right hand, face)
- [x] Show landmark counts below video feed (moved to console.info for developers)
- [x] Add visual feedback when detection confidence is low (emoji vs ✗)
- [x] Implement Start/Stop Monitoring button with webcam privacy control

### 1.5 Shoulder Triangle & Detection Init
- [x] Replace torso bounding box with shoulder triangle (nose→L shoulder→R shoulder)
- [x] Keep hand and face bounding boxes
- [x] Add Z-coordinate debug logging for shoulder landmarks
- [x] Add "Initializing detection..." status between camera ready and "Running"

**Dependencies**: Phase 0  
**Outputs**: Running MediaPipe with webcam, console landmark output

---

## Phase 2: Reference System & Capture UX

### 2.1 IndexedDB Reference Store
- [x] Create `src/core/reference-store.ts`
- [x] Store triangle landmarks (nose, L shoulder, R shoulder) + computed ratio only
- [x] Implement save/load reference pose (single pose)
- [x] Add IndexedDB schema versioning
- [x] Handle initial state (no reference captured)
- [x] Add `clearAllData()` function for reusable data reset

### 2.2 Capture Mode UI Flow
- [x] On load: check IndexedDB for existing reference
  - If no reference: require 3-second capture before monitoring can start
  - If reference exists: show "Reference pose loaded" status with ISO date, enable monitoring immediately
- [x] Wire up "Capture Reference" button with 3-second countdown
  - Instruction: "Hold good posture... 3... 2... 1..."
  - Average triangle landmarks across ~3 seconds of frames for stable reference
  - Require minimum 10 valid frames with all 3 triangle landmarks
- [x] Handle capture errors (insufficient frames, partial detection)
- [x] Existing capture button serves as re-capture trigger (for lighting/position changes)

### 2.3 Basic UI Shell & Privacy Notice
- [x] Add privacy disclaimer: "No photos taken, retained, or transmitted. All calculations numeric-only, stored locally."
- [x] Wire up existing capture/start buttons to new capture flow
- [x] Show reference status (loaded from storage vs. needs capture) with ISO date
- [x] Add "Clear all local data" link (stops webcam, deletes IndexedDB, resets UI, shows success toast)
- [x] Add ARIA live region for reference status
- [x] Add basic CSS (accessibility: high contrast, keyboard nav)
- [x] Add ARIA labels for screen readers

**Dependencies**: Phase 1  
**Outputs**: Can capture and save reference pose, see it in UI

---

## Phase 3: Proximity & Deviation Detection

### 3.1 Hand-Face Proximity Detection
- [ ] Create proximity calculator in `src/core/nudge-engine.ts`
- [ ] Calculate hand-landmark to face-landmark distances
- [ ] Implement threshold-based proximity alert
- [ ] Track proximity event frequency

### 3.2 Shoulder Rounding Detection (Ratio-Based)
- [ ] Calculate shoulder triangle ratio: `shoulder_width / shoulder_midpoint_to_nose_distance`
- [ ] Compare live ratio against captured reference ratio
- [ ] Track nose-to-shoulder-midpoint Y-delta to guard against head-tilt false positives
- [ ] Use Z-coordinate averages as secondary reinforcement signal
- [ ] Aggregate into overall posture score

### 3.3 Alert System MVP
- [ ] Normal deviation: Short audio beep + background flash (max 1 per minute, hard-coded)
- [ ] Low confidence detection: Yellow background flash only, no audio
- [ ] Prioritize hand-face proximity alerts
- [ ] Implement cooldown timers (avoid spam)

**Dependencies**: Phase 2  
**Outputs**: Proximity detection working, basic deviation scoring, audio/visual alerts

---

## Phase 4: Worker Architecture & Ghost Rendering

### 4.1 OffscreenCanvas Worker Setup
- [ ] Create `src/workers/ghost-renderer.ts`
- [ ] Transfer canvas control to worker
- [ ] Implement message passing protocol

### 4.2 Ghost Outline Rendering
- [ ] Draw reference pose outline (semi-transparent)
- [ ] Draw current pose outline (different color)
- [ ] Highlight deviation areas
- [ ] Update on every 3rd frame

### 4.3 Nudge Engine Polish
- [ ] Tweak deviation thresholds
- [ ] Add smoothing to reduce jitter
- [ ] Implement confidence filtering (low-confidence landmarks)

**Dependencies**: Phase 3  
**Outputs**: Ghost overlay, smoother detection

---

## Phase 5: Polish & Release Prep

### 5.1 Settings Panel
- [ ] Add settings UI (sensitivity, model level)
- [ ] Persist settings to localStorage
- [ ] Add model complexity toggle (0, 1, 2)
- [ ] Alert type preferences

### 5.2 Battery API Integration
- [ ] Monitor battery level
- [ ] Auto-throttle when < 20%
- [ ] Show battery indicator in UI
- [ ] Restore full performance when charging

### 5.3 Performance Optimizations
- [ ] Add GPU memory cleanup (`holistic.close()`)
- [ ] Implement camera resolution selection
- [ ] Optimize JavaScript bundle size
- [ ] Profile and fix hot paths

### 5.4 Documentation & Release
- [ ] Update README with user guide
- [ ] Add inline code comments for complex algorithms
- [ ] Bump version to 0.1.0
- [ ] Tag release in git
- [ ] Deploy to Cloudflare Pages
- [ ] Verify service worker update mechanism

**Dependencies**: Phase 4  
**Outputs**: MVP 0.1.0 ready for use

---

## Notes & Open Questions

- **Lite Model**: Currently not in plan; will add if user feedback requests lower resource usage
- **Gesture Support**: Future enhancement for custom gestures as reference triggers
- **Data Export**: Consider allowing users to export reference poses (JSON) for backup
- **Telemetry**: Zero telemetry is strict requirement; all logging must be console-only
- **Testing**: MVP uses TypeScript LSP only. Testing framework may be added post-MVP if needed.

---

## Milestone Checklist

- [ ] **M0**: Repo structure, build tools (end of Phase 0)
- [ ] **M1**: MediaPipe running with webcam (end of Phase 1)
- [ ] **M2**: Reference capture working (end of Phase 2)
- [ ] **M3**: Proximity detection alerting (end of Phase 3)
- [ ] **M4**: Ghost rendering and visual alerts (end of Phase 4)
- [ ] **M5**: MVP 0.1.0 released (end of Phase 5)
