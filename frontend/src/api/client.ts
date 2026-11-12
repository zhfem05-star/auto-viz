import createClient from 'openapi-fetch'
import type { components, paths } from './schema'

/**
 * 백엔드 API 클라이언트. 타입은 백엔드 OpenAPI 스키마에서 생성된다.
 * 스키마 갱신: `npm run gen:api` (backend 가상환경 필요)
 */
export const api = createClient<paths>({
  baseUrl: globalThis.location?.origin ?? '',
  // openapi-fetch는 생성 시점의 fetch를 캡처하므로, 호출 시점의 globalThis.fetch를 쓰도록 감싼다(테스트 mock 대응).
  fetch: (request) => globalThis.fetch(request),
})

export type Schemas = components['schemas']

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** FastAPI 오류 응답({detail})에서 사용자에게 보여줄 메시지를 뽑는다. */
function messageOf(error: unknown, status: number): string {
  const detail = (error as { detail?: unknown } | undefined)?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { loc?: unknown[]; msg?: string }
    const field = first.loc?.at(-1)
    return field ? `${String(field)}: ${first.msg}` : (first.msg ?? '입력값이 올바르지 않습니다.')
  }
  return `요청에 실패했습니다 (HTTP ${status})`
}

/** openapi-fetch 결과를 데이터로 풀고, 실패하면 ApiError를 던진다. */
export async function unwrap<T>(
  promise: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await promise
  if (!response.ok) throw new ApiError(response.status, messageOf(error, response.status))
  return data as T
}
