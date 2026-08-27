import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/cal-index/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'CAL·INDEX 热量大盘',
        short_name: 'CAL·INDEX',
        description: '把每日热量收支变成一张属于你的减脂大盘。',
        theme_color: '#080d0e',
        background_color: '#080d0e',
        display: 'standalone',
        start_url: '/cal-index/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      }
    })
  ]
})
