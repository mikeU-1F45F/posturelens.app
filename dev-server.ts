#!/usr/bin/env bun

const pkg = await Bun.file('./package.json').json()
const version = typeof pkg?.version === 'string' ? pkg.version : 'dev'

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
console.info('Hot reload enabled for TypeScript changes')

process.on('SIGINT', () => {
  console.info('\n👋 Shutting down dev server')
  process.exit(0)
})
