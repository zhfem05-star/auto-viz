import createClient from 'openapi-fetch'
import type { paths } from './schema'

/**
 * 백엔드 API 클라이언트. 타입은 백엔드 OpenAPI 스키마에서 생성된다.
 * 스키마 갱신: `npm run gen:api` (backend 가상환경 필요)
 */
export const api = createClient<paths>({
  baseUrl: globalThis.location?.origin ?? '',
  // openapi-fetch는 생성 시점의 fetch를 캡처하므로, 호출 시점의 globalThis.fetch를 쓰도록 감싼다(테스트 mock 대응).
  fetch: (request) => globalThis.fetch(request),
})
