import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname);

export default defineConfig({
  root,
  publicDir: 'public',
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        dashboard: resolve(root, 'index.html'),
        discover: resolve(root, 'discover.html'),
        opportunities: resolve(root, 'opportunities.html'),
        verification: resolve(root, 'verification.html'),
        companies: resolve(root, 'companies.html'),
        reports: resolve(root, 'reports.html'),
        settings: resolve(root, 'settings.html'),
      },
      output: {
        manualChunks: {
          vendor: ['jquery', 'axios', 'lucide'],
          charts: ['chart.js'],
          export: ['xlsx', 'jspdf', 'jspdf-autotable'],
        },
      },
    },
  },
});
