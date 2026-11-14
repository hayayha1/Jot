import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    watch: { ignored: ['**/.test-data/**', '**/.desktop/**', '**/.npm-cache/**', '**/release/**', '**/test-results/**', '**/dist/**', '**/.write-lock/**', '**/notes.json*', '**/notes.*.tmp'] }
  },
  build: { rollupOptions: { output: { manualChunks: { editor: ['@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-image', '@tiptap/extension-placeholder'] } } } }
});
