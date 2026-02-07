// PostureLens Service Worker
// Precaches static assets, handles version updates

const PACKAGE_VERSION = '__PACKAGE_VERSION__'
const CACHE_NAME = `posturelens-v${PACKAGE_VERSION}`

const PRECACHE_URLS = ['/', '/index.html', '/main.js', '/models/holistic-lite.bin']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.info('[SW] Precaching app shell')
      return cache.addAll(PRECACHE_URLS)
    }),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => {
            console.info('[SW] Deleting old cache:', cacheName)
            return caches.delete(cacheName)
          }),
      )
    }),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (event.request.url.endsWith('/package.json')) {
        return fetch(event.request).then((response) => {
          return response
        })
      }

      if (cachedResponse) {
        return cachedResponse
      }

      return fetch(event.request).catch(() => {
        return new Response('Offline', { status: 503 })
      })
    }),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
