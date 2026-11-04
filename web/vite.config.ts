import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // `uvicorn server.main:app` on :8000 answers /api/* during development.
    proxy: { '/api': 'http://localhost:8000' },
  },
  build: { target: 'es2020', chunkSizeWarningLimit: 600 },
});
