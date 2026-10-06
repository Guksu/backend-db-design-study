import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['cases/**/experiments/**/*.test.ts'],
    // 실험들이 같은 DB를 쓰므로 파일 단위 병렬 실행을 끈다
    fileParallelism: false,
    passWithNoTests: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
