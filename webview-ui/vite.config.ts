import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    outDir: '../out/webview',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        usage: path.resolve(__dirname, 'usage.html'),
        marketplace: path.resolve(__dirname, 'marketplace.html'),
      },
      output: { entryFileNames: 'assets/[name].js', chunkFileNames: 'assets/[name].js', assetFileNames: 'assets/[name].[ext]' },
    },
  },
});
