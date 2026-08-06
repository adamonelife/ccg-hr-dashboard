import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local dev proxies /api to `vercel dev` (run that in a second terminal on
// port 3000). In production, Vite and the API function are served from the
// same Vercel deployment so no proxy is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
