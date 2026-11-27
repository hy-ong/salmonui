import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// One HTML entry per page (src/pages.ts), so each page's initial JS and CSS
// carry only its own families (example app bundle budgets).
const page = (file: string) => fileURLToPath(new URL(file, import.meta.url));

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  build: {
    target: 'es2022',
    ...(isSsrBuild ? {} : { rollupOptions: { input: { grid: page('index.html'), pickers: page('pickers.html'), pivot: page('pivot.html'), kanban: page('kanban.html'), assistant: page('assistant.html'), dropdowns: page('dropdowns.html'), locale: page('locale.html') } } }),
  },
  // Bundle the Salmon UI packages into the server build.
  ssr: { noExternal: [/^@salmonui\//] },
}));
