# PostureLens - AI Posture Companion

**Version**: 0.1.0-MVP  
**Privacy**: Zero telemetry, pure local-first  
**Target**: Desktop/laptop browsers only (Chrome 90+)  

PostureLens uses MediaPipe pose detection to monitor your posture and provide gentle nudges when you slouch or drift from your reference pose.

## Quickstart

### Installation

```bash
# Install dependencies
bun install

# MediaPipe models are included in the repository
# All assets (~26MB) are ready to use - no additional downloads needed
```

### Development

```bash
# Start dev server (http://localhost:3000)
bun run dev

# Build for production
bun run build

# Check code quality
bun run lint
bun run check

# Auto-format code
bun run format
```

### Deploy

```bash
# Deploy to Cloudflare Pages
bun run deploy
```

## Browser Requirements

- Chrome 90+ (recommended: 113+ for WebGPU)
- Edge 90+
- Firefox 88+ (OffscreenCanvas worker support limited)
- Safari 15+

**NOT supported on mobile devices** - blocked by user agent detection.

## Project Structure

```
├── public/               # Static assets served by dev server
│   ├── index.html       # App shell
│   ├── style.css        # Vanilla CSS
│   ├── main.js          # Compiled TypeScript (generated)
│   ├── main.js.map      # Source maps (generated)
│   ├── sw.js           # Service worker
│   └── models/         # MediaPipe model files
├── src/
│   ├── main.ts         # App bootstrap and orchestration
│   ├── core/           # Detection, storage, nudge engine
│   │   ├── detector.ts
│   │   ├── nudge-engine.ts
│   │   └── reference-store.ts
│   └── workers/        # OffscreenCanvas rendering
│       └── ghost-renderer.ts
├── build.ts            # Production build script
├── dev-server.ts       # Development server
└── package.json
```

## Key Features

- **Local Processing**: All pose detection runs in-browser using WebGPU/WASM
- **No Network**: After initial load, zero external requests
- **Privacy First**: Stop/Start monitoring with full webcam control
- **Video Preview**: Live webcam feed with detection visualization
  - Color-coded bounding boxes (pose, hands, face)
  - Real-time detection status with emoji indicators
- **Performance**: Frame decimation (1/3 frames) for 60-90 FPS
- **First-time Download**: ~26MB (cached for offline use)

## Performance Notes

- First load: ~26MB download with progress indicator (models + WASM)
- Subsequent loads: <2s (cached locally)
- Detection: Every 3rd frame (~90ms intervals)
- Stop monitoring: Webcam fully released, minimal CPU/GPU impact
- Using lite model (modelComplexity: 0) for optimal performance

## Development Notes

- No testing framework for MVP - rely on TypeScript LSP
- No CSS frameworks - vanilla CSS only
- Hand-written service worker for versioning control
- Biome for linting/formatting (format on save recommended)

## License

MIT

## Contributing

This is a personal project. Issues and PRs welcome for non-MVP features.
