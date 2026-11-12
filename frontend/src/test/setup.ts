// 테스트 정리(cleanup)와 mock 복원은 vite.config.ts의 test 옵션(globals, restoreMocks)으로 처리한다.
import '@testing-library/jest-dom/vitest'

// Radix UI(드롭다운/다이얼로그)가 jsdom에 없는 브라우저 API를 사용한다.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.setPointerCapture = () => {}
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
