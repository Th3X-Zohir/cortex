import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
export default defineConfig({
    base: '/admin/',
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:31338',
                changeOrigin: true,
            },
            '/ws': {
                target: 'ws://localhost:31338',
                ws: true,
            },
        },
    },
});
