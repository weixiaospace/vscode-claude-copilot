import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../out/webview',
    emptyOutDir: true,
    rollupOptions: {
      input: { usage: path.resolve(__dirname, 'index.html') },
      output: { entryFileNames: 'assets/[name].js', chunkFileNames: 'assets/[name].js', assetFileNames: 'assets/[name].[ext]' },
    },
  },
});
