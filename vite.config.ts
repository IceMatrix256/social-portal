import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
const backendTarget = process.env.SOCIAL_PORTAL_BACKEND_URL || 'http://localhost:8090'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/reddit': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api/mastodon': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api/nostr': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api/lemmy': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api/custom-feed': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api/misskey': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api/misskey-design': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api/bluesky': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api/proxy': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api/nitter': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api/redlib': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api/healthz': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
