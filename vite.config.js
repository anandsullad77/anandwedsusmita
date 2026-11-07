import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    watch: {
      ignored: ['**/artifacts/**'],
      // Windows can lock a new image while it is being copied into the project.
      usePolling: process.platform === 'win32',
      interval: 250,
      binaryInterval: 500,
    },
  },
});
