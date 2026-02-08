// PostureLens Service Worker
// Precaches static assets, handles version updates

const PACKAGE_VERSION = '__PACKAGE_VERSION__'
const CACHE_NAME = `posturelens-v${PACKAGE_VERSION}`

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/main.js',
  '/holistic.js',
  // Core MediaPipe assets for modelComplexity=0 (lite)
  '/models/holistic.binarypb',
  '/models/holistic_solution_packed_assets.data',
  '/models/holistic_solution_packed_assets_loader.js',
  '/models/holistic_solution_simd_wasm_bin.js',
  '/models/holistic_solution_simd_wasm_bin.wasm',
  '/models/holistic_solution_wasm_bin.js',
  '/models/pose_landmark_lite.tflite',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.info('[SW] Precaching app shell + core model assets')
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
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)
  const isDevHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1'

  // In dev, always load the latest bundle from the server so refresh picks up changes.
  // (Otherwise the SW can serve a stale cached /main.js and make debugging confusing.)
  if (isDevHost && (url.pathname === '/main.js' || url.pathname === '/main.js.map')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)))
    return
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (event.request.url.endsWith('/package.json')) {
        return fetch(event.request)
      }

      if (cachedResponse) {
        return cachedResponse
      }

      return fetch(event.request)
        .then((response) => {
          // Cache-bust by versioned cache name; avoid caching cross-origin.
          if (url.origin === self.location.origin && url.pathname.startsWith('/models/')) {
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => {
                return cache.put(event.request, response.clone())
              }),
            )
          }

          return response
        })
        .catch(() => {
          return new Response('Offline', { status: 503 })
        })
    }),
  )
})

const FULL_POSE_MODEL_URL = '/models/pose_landmark_full.tflite'

async function postMessageToClient(event, message) {
  if (event.source && typeof event.source.postMessage === 'function') {
    event.source.postMessage(message)
    return
  }

  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })
  for (const client of clients) {
    client.postMessage(message)
  }
}

async function isUrlCached(url) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(url)
  return Boolean(cached)
}

self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || typeof data.type !== 'string') return

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting()
    return
  }

  if (data.type === 'GET_VERSION') {
    const payload = { type: 'SW_VERSION', version: PACKAGE_VERSION }

    // Prefer replying on a MessageChannel port if provided.
    const port = event.ports?.[0]
    if (port) {
      port.postMessage(payload)
    } else {
      event.waitUntil(postMessageToClient(event, payload))
    }

    return
  }

  if (data.type === 'CHECK_FULL_POSE_MODEL_CACHE') {
    event.waitUntil(
      (async () => {
        const cached = await isUrlCached(FULL_POSE_MODEL_URL)
        await postMessageToClient(event, {
          type: 'FULL_POSE_MODEL_CACHE_STATUS',
          cached,
        })
      })(),
    )
    return
  }

  if (data.type === 'PREFETCH_FULL_POSE_MODEL') {
    event.waitUntil(
      (async () => {
        try {
          const cache = await caches.open(CACHE_NAME)
          const alreadyCached = await cache.match(FULL_POSE_MODEL_URL)
          if (!alreadyCached) {
            await cache.add(FULL_POSE_MODEL_URL)
          }

          await postMessageToClient(event, {
            type: 'FULL_POSE_MODEL_PREFETCH_COMPLETE',
            ok: true,
            cached: true,
          })
        } catch (error) {
          console.warn('[SW] Full pose model prefetch failed:', error)
          await postMessageToClient(event, {
            type: 'FULL_POSE_MODEL_PREFETCH_COMPLETE',
            ok: false,
            cached: false,
          })
        }
      })(),
    )
  }
})
