import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  resolve: {
    alias: { '@web': fileURLToPath(new URL('./web/src', import.meta.url)) },
  },
  server: {
    port: 5288,
    strictPort: true,
    proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 4000}` },
    // 케이스별 화면은 web/ 밖의 cases/ 폴더에 있다
    fs: { allow: ['..'] },
  },
});
