import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    // qrcode.react v4 走 CJS interop 时 Vite 会重复打包 React，导致 useMemo=null。
    // 强制 dedupe 让所有 dep 用同一份 react / react-dom。
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['qrcode.react'],
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://excs.crossovercg.com.cn',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
