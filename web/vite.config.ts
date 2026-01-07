import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from 'vite-plugin-pwa'

// @ts-ignore
const pwaPlugin = VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['favicon.ico', 'favicon.png'],
  manifest: {
    name: 'OneCode',
    short_name: 'OneCode',
    description: 'AI-powered coding assistant with Codex and Claude Code integration',
    theme_color: '#000000',
    background_color: '#ffffff',
    display: 'standalone',
    icons: [
      {
        src: 'favicon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable'
      }
    ]
  },
  workbox: {
    maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MB
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/api\//i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-cache',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24 // 24 hours
          }
        }
      },
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|ico|webp)$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'image-cache',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
          }
        }
      }
    ]
  }
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    pwaPlugin as any
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@animate-ui/components-buttons-theme-toggler": path.resolve(
        __dirname,
        "./src/components/animate-ui/components/buttons/theme-toggler",
      ),
      "@animate-ui/components-base-files": path.resolve(
        __dirname,
        "./src/components/animate-ui/components/radix/files",
      ),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:9110',
        changeOrigin: true,
        ws: true, // 启用 WebSocket 代理
        // 不重写路径，保持 /api 前缀
      },
      '/.well-known': {
        target: 'http://localhost:9110',
        changeOrigin: true,
      },
    }
  }
})
