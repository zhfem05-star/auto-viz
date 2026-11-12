import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { installFakeApi } from '@/test/fakeApi'
import { renderApp } from '@/test/render'

const healthBody = (overrides: Partial<{ status: string; version: string; database: string }> = {}) =>
  Response.json({ status: 'ok', version: '1.2.3', database: 'ok', ...overrides })

const healthCalls = (api: ReturnType<typeof installFakeApi>) =>
  api.requests.filter((r) => r.path === '/api/health').length

describe('API 상태 표시', () => {
  it('정상 응답이면 연결됨과 서버 버전을 표시한다', async () => {
    const api = installFakeApi({ health: () => healthBody({ version: '1.2.3' }) })
    renderApp('/')

    expect(screen.getByRole('heading', { name: 'auto-viz' })).toBeInTheDocument()
    expect(await screen.findByText('API 연결됨 · v1.2.3')).toBeInTheDocument()
    expect(healthCalls(api)).toBe(1)
  })

  it('서버가 degraded를 보고하면 연결 안 됨으로 표시한다', async () => {
    const api = installFakeApi({ health: () => healthBody({ status: 'degraded', database: 'error' }) })
    renderApp('/')

    expect(await screen.findByText('API 연결 안 됨')).toBeInTheDocument()
    expect(healthCalls(api)).toBe(1)
  })

  it('네트워크 오류면 연결 안 됨으로 표시한다', async () => {
    const api = installFakeApi({ health: () => new TypeError('fetch failed') })
    renderApp('/')

    expect(await screen.findByText('API 연결 안 됨')).toBeInTheDocument()
    expect(healthCalls(api)).toBe(1)
  })

  it('HTTP 오류 응답(500)이면 연결 안 됨으로 표시한다', async () => {
    installFakeApi({ health: () => new Response('boom', { status: 500 }) })
    renderApp('/')

    expect(await screen.findByText('API 연결 안 됨')).toBeInTheDocument()
  })

  it('응답 전에는 확인 중으로 표시한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
    renderApp('/')

    expect(screen.getByText('API 확인 중')).toBeInTheDocument()
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
  })
})

describe('라우팅', () => {
  it('프로젝트 섹션 경로는 섹션 이름과 프로젝트 이름을 보여준다', async () => {
    installFakeApi({ projects: [{ id: 'p-42', name: '매출 분석' }] })
    renderApp('/projects/p-42/datasets')

    expect(screen.getByRole('heading', { name: '데이터셋' })).toBeInTheDocument()
    expect(await screen.findByText('· 매출 분석')).toBeInTheDocument()
  })

  it('알 수 없는 섹션은 404를 보여준다', () => {
    installFakeApi({ projects: [{ id: 'p-42' }] })
    renderApp('/projects/p-42/unknown')

    expect(screen.getByText('페이지를 찾을 수 없습니다')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '데이터셋' })).not.toBeInTheDocument()
  })

  it('정의되지 않은 경로는 404를 보여준다', () => {
    installFakeApi()
    renderApp('/nope')

    expect(screen.getByText('페이지를 찾을 수 없습니다')).toBeInTheDocument()
  })
})
