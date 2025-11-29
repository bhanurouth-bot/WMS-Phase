// wms_frontend/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'vite.svg'],
      manifest: {
        name: 'NexWMS Scanner',
        short_name: 'NexWMS',
        description: 'Warehouse Management System Mobile Client',
        theme_color: '#1e293b',
        icons: [
          {
            src: 'pwa-192x192.png', // You need to add these icons to /public
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ],
        display: 'standalone', // Hides browser bar
        orientation: 'portrait'
      }
    })
  ],
})