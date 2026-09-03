import { writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const distPlaceholder = '# Keeps frontend/dist available for Go embeds in clean checkouts.\n';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'preserve-dist-placeholder',
      closeBundle() {
        writeFileSync(new URL('./dist/.gitkeep', import.meta.url), distPlaceholder);
      },
    },
  ],
});
