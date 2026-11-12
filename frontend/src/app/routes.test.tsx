import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { routes } from './routes'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

/**
 * /api/health 요청에만 지정한 응답을 돌려주는 fetch mock.
 * 다른 URL이 호출되면 실패시켜, 엉뚱한 엔드포인트를 호출해도 통과하는 일을 막는다.
 */
function mockHealth(result: Response | Error) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.origin !== window.location.origin || url.pathname !== '/api/health') {
      throw new Error(`예상하지 못한 요청: ${url.href}`)
    }
    if (result instanceof Error) throw result
    return result.clone()
  })
}

function healthBody(overrides: Partial<{ status: string; version: string; database: string }> = {}) {
  return Response.json({ status: 'ok', version: '1.2.3', database: 'ok', ...overrides })
}

describe('API 상태 표시', () => {
  it('정상 응답이면 연결됨과 서버 버전을 표시한다', async () => {
    const fetchSpy = mockHealth(healthBody({ version: '1.2.3' }))
    renderAt('/')

    expect(screen.getByRole('heading', { name: 'auto-viz' })).toBeInTheDocument()
    expect(await screen.findByText('API 연결됨 · v1.2.3')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('서버가 degraded를 보고하면 연결 안 됨으로 표시한다', async () => {
    const fetchSpy = mockHealth(healthBody({ status: 'degraded', database: 'error' }))
    renderAt('/')

    expect(await screen.findByText('API 연결 안 됨')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('네트워크 오류면 연결 안 됨으로 표시한다', async () => {
    const fetchSpy = mockHealth(new TypeError('fetch failed'))
    renderAt('/')

    expect(await screen.findByText('API 연결 안 됨')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('HTTP 오류 응답(500)이면 연결 안 됨으로 표시한다', async () => {
    mockHealth(new Response('boom', { status: 500 }))
    renderAt('/')

    expect(await screen.findByText('API 연결 안 됨')).toBeInTheDocument()
  })

  it('응답 전에는 확인 중으로 표시한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
    renderAt('/')

    expect(screen.getByText('API 확인 중')).toBeInTheDocument()
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
  })
})

describe('라우팅', () => {
  it('프로젝트 섹션 경로는 섹션 이름과 프로젝트 ID를 보여준다', () => {
    mockHealth(healthBody())
    renderAt('/projects/p-42/datasets')

    expect(screen.getByRole('heading', { name: '데이터셋' })).toBeInTheDocument()
    expect(screen.getByText('· p-42')).toBeInTheDocument()
  })

  it('알 수 없는 섹션은 404를 보여준다', () => {
    mockHealth(healthBody())
    renderAt('/projects/p-42/unknown')

    expect(screen.getByText('페이지를 찾을 수 없습니다')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '데이터셋' })).not.toBeInTheDocument()
  })

  it('정의되지 않은 경로는 404를 보여준다', () => {
    mockHealth(healthBody())
    renderAt('/nope')

    expect(screen.getByText('페이지를 찾을 수 없습니다')).toBeInTheDocument()
  })
})
