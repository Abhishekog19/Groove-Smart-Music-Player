import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const RAILWAY_URL = 'https://smusic-backend-production.up.railway.app';

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
    ],
    server: {
        proxy: {
            '/api': {
                target: RAILWAY_URL,
                changeOrigin: true,
                secure: false,          // don't verify Railway's TLS cert in dev
                rewrite: (path) => path // keep /api/... path as-is
            }
        }
    }
})
