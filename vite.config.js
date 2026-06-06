import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const BACKEND_URL = 'https://smusic-backend.onrender.com'; // 🔁 Update this with your actual Render URL

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
    ],
    server: {
        proxy: {
            '/api': {
                target: BACKEND_URL,
                changeOrigin: true,
                secure: true,
                rewrite: (path) => path // keep /api/... path as-is
            }
        }
    }
})
