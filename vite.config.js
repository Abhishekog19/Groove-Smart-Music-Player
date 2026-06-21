import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const BACKEND_URL = process.env.VITE_BACKEND_URL || 'http://localhost:3001'; // Local dev: use local backend. For production/Render: set VITE_BACKEND_URL=https://smusic-backend.onrender.com

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
