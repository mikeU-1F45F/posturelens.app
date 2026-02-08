#!/usr/bin/env bun

import { build } from 'bun'

const pkg = await Bun.file('./package.json').json()
const version = typeof pkg?.version === 'string' ? pkg.version : 'dev'

let buildInFlight: Promise<void> | null = null

async function ensureMainBuilt(): Promise<void> {
  if (buildInFlight) return buildInFlight

  buildInFlight = (async () => {
    const result = await build({
      entrypoints: ['./src/main.ts'],
      outdir: './public',
      target: 'browser',
      format: 'esm',
      splitting: false,
      sourcemap: 'external',
      minify: false,
      external: ['@mediapipe/holistic'],
    })

    if (!result.success) {
      console.error('❌ Dev build failed:', result.logs)
      throw new Error('Dev build failed')
    }
  })().finally(() => {
    buildInFlight = null
  })

  return buildInFlight
}

const server = Bun.serve({
  port: process.env.PORT || 3000,
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname === '/' ? '/index.html' : url.pathname

    // Always serve a version-injected service worker so cache names reflect package.json.
    if (path === '/sw.js') {
      try {
        const template = Bun.file('./public/sw.template.js')
        const text = await template.text()
        const body = text.replaceAll('__PACKAGE_VERSION__', version)

        return new Response(body, {
          headers: {
            'content-type': 'application/javascript; charset=utf-8',
            'cache-control': 'no-store',
          },
        })
      } catch {
        return new Response('Not Found', { status: 404 })
      }
    }

    // Rebuild on request so `bun run dev` always reflects `src/` changes after a refresh.
    if (path === '/main.js' || path === '/main.js.map') {
      try {
        await ensureMainBuilt()
      } catch {
        return new Response('Build failed', { status: 500 })
      }

      const file = Bun.file(`./public${path}`)
      return new Response(file, {
        headers: {
          'cache-control': 'no-store',
        },
      })
    }

    try {
      const file = Bun.file(`./public${path}`)
      return new Response(file)
    } catch {
      return new Response('Not Found', { status: 404 })
    }
  },
  error() {
    return new Response('Not Found', { status: 404 })
  },
})

console.info(`🚀 Dev server running at http://localhost:${server.port}`)
console.info('Serving static files from ./public')
console.info('Refresh the page to pick up TypeScript changes')

process.on('SIGINT', () => {
  console.info('\n👋 Shutting down dev server')
  process.exit(0)
})
