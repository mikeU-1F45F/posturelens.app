#!/usr/bin/env bun

import { build } from 'bun'

console.log('Building ShadowNudge...')

const result = await build({
  entrypoints: ['./src/main.ts'],
  outdir: './public',
  target: 'browser',
  format: 'esm',
  splitting: false,
  sourcemap: 'external',
  minify: true,
  external: ['@mediapipe/holistic'],
})

if (result.success) {
  console.log('✅ Build complete: public/main.js')
} else {
  console.error('❌ Build failed:', result.logs)
  process.exit(1)
}
