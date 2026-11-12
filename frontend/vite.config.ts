/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    // 개발 중에는 /api 요청을 FastAPI(8000)로 프록시
    proxy: { '/api': 'http://localhost:8000' },
  },
  test: {
    // npm test는 scripts/vitest.mjs를 거쳐 실행된다 (Windows 드라이브 문자 대소문자 문제 우회)
    environment: 'jsdom',
    globals: true, // Testing Library 자동 cleanup
    restoreMocks: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
