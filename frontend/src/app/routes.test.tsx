import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
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

function mockHealth(response: Response | Error) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  )
}

describe('routes', () => {
  it('홈 화면과 API 상태를 보여준다', async () => {
    mockHealth(Response.json({ status: 'ok', version: '0.1.0', database: 'ok' }))
    renderAt('/')

    expect(screen.getByRole('heading', { name: 'auto-viz' })).toBeInTheDocument()
    expect(await screen.findByText('API 연결됨 · v0.1.0')).toBeInTheDocument()
  })

  it('API가 응답하지 않으면 연결 안 됨으로 표시한다', async () => {
    mockHealth(new TypeError('fetch failed'))
    renderAt('/')

    expect(await screen.findByText('API 연결 안 됨')).toBeInTheDocument()
  })

  it('프로젝트 섹션 경로를 렌더링한다', () => {
    mockHealth(new TypeError('fetch failed'))
    renderAt('/projects/demo/library')

    expect(screen.getByRole('heading', { name: '라이브러리' })).toBeInTheDocument()
  })

  it('알 수 없는 섹션은 404를 보여준다', () => {
    mockHealth(new TypeError('fetch failed'))
    renderAt('/projects/demo/unknown')

    expect(screen.getByText('페이지를 찾을 수 없습니다')).toBeInTheDocument()
  })
})
