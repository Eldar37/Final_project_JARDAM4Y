import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: '/search-v2/',
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../public/search-v2'),
    emptyOutDir: true
  }
});
