import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'

import tailwindcss from '@tailwindcss/vite'

function requireProductionSocketUrl(value) {
  if (!value) throw new Error('VITE_SOCKET_URL is required for production builds')

  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('VITE_SOCKET_URL must be a valid absolute URL')
  }

  const hostname = url.hostname.toLowerCase()
  const isLocal = hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === '0.0.0.0'
    || hostname === '::'
    || hostname === '[::]'
    || hostname === '::1'
    || hostname === '[::1]'
    || hostname.startsWith('127.')
  if (url.protocol !== 'https:') throw new Error('VITE_SOCKET_URL must use HTTPS for production builds')
  if (isLocal) {
    throw new Error('VITE_SOCKET_URL must not use a local address for production builds')
  }
  if (url.username || url.password) throw new Error('VITE_SOCKET_URL must not contain credentials')

  return url.origin
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    requireProductionSocketUrl(
      process.env.VITE_SOCKET_URL
        || env.VITE_SOCKET_URL
        || process.env.VITE_API_BASE_URL
        || env.VITE_API_BASE_URL
    )
  }

  return {
    plugins: [
      vue(),
      vueJsx(),
      vueDevTools(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
  }
})
