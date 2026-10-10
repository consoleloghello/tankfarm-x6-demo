import { defineConfig } from 'vite';

export default defineConfig({
  // 相对路径：本地打开、部署到 GitHub Pages 子路径（/repo-name/）都能正常加载资源
  base: './',
  server: {
    host: true,
    port: 5188,
    strictPort: false,
  },
  preview: {
    port: 5188,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
