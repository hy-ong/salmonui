import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Port: SALMON_UI_PORT_BASE + 60 (dev) and + 70 (preview), like the other examples' offsets.
const base = Number(process.env['SALMON_UI_PORT_BASE'] ?? 41730);

export default defineConfig({
  plugins: [react()],
  server: { port: base + 60, strictPort: true },
  preview: { port: base + 70, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
});
