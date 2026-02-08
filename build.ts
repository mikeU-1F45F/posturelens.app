#!/usr/bin/env bun

import { build } from 'bun'

console.info('Building PostureLens...')

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

if (!result.success) {
  console.error('❌ Build failed:', result.logs)
  process.exit(1)
}

const pkg = await Bun.file('./package.json').json()
const version = typeof pkg?.version === 'string' ? pkg.version : null
if (!version) {
  console.error('❌ Build failed: package.json missing version')
  process.exit(1)
}

const swTemplate = await Bun.file('./public/sw.template.js').text()
const swContents = swTemplate.replaceAll('__PACKAGE_VERSION__', version)
await Bun.write('./public/sw.js', swContents)

console.info('✅ Build complete: public/main.js + public/sw.js')
