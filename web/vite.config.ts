import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em desenvolvimento a interface roda em 47816 e repassa /api para o servidor em 47815.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  server: {
    port: 47816,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:47815' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
