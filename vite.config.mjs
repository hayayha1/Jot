import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ base: './', plugins: [react()], server: { host: '127.0.0.1', port: 5173, strictPort: true }, build: { rollupOptions: { output: { manualChunks: { editor: ['@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-image', '@tiptap/extension-placeholder'] } } } } });
