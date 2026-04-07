import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
    ],
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true,
                secure: false,
            }
        },
        watch: {
            // Ignore server-side files and any debug output files
            ignored: [
                '**/server/**',
                '**/node_modules/**',
                '**/*.json',
            ]
        }
    }
})
