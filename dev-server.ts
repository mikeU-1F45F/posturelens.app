#!/usr/bin/env bun

const server = Bun.serve({
  port: process.env.PORT || 3000,
  fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname === '/' ? '/index.html' : url.pathname

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
