import { defineConfig } from 'vitest/config';
import path from 'path';

// 与 vite.config.ts 分开避免污染 dev/build 配置；alias 同步保持 `@/...` 可解析。
// DRC-Phase 5：tsx 组件测试通过文件级指令 `// @vitest-environment jsdom` 切到 jsdom。
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
