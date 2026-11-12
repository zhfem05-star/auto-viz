import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Connection, LLMConfig } from '@/api/projects'
import { installFakeApi } from '@/test/fakeApi'
import { renderApp } from '@/test/render'

const PID = 'p1'
const URL_ = `/projects/${PID}/connection`

/** 폼이 로드된 뒤의 카드를 찾는다. 로딩 중에는 같은 이름의 다른 카드가 먼저 그려진다. */
async function loadedCard(name: '데이터베이스' | 'LLM') {
  await screen.findByLabelText(name === '데이터베이스' ? 'DB 종류' : '제공사')
  return screen.getByRole('region', { name })
}

const savedConnection: Connection = {
  db_type: 'postgresql',
  host: 'db.internal',
  port: 5432,
  database: 'shop',
  username: 'reader',
  has_password: true,
  status: 'ok',
  last_error: null,
  last_tested_at: null,
  schema_updated_at: null,
  table_count: null,
}

describe('데이터베이스 연결', () => {
  it('입력값과 비밀번호를 저장하고 연결 테스트 결과를 보여준다', async () => {
    const api = installFakeApi({
      projects: [{ id: PID }],
      connectionTest: () => ({ ok: false, latency_ms: null, server_version: null, error: 'connection refused' }),
    })
    const { user } = renderApp(URL_)
    const card = await loadedCard('데이터베이스')

    await user.type(within(card).getByLabelText('호스트'), ' db.example.com ')
    await user.type(within(card).getByLabelText('데이터베이스'), 'shop')
    await user.type(within(card).getByLabelText('사용자'), 'reader')
    await user.type(within(card).getByLabelText('비밀번호'), 's3cret!')
    await user.click(within(card).getByRole('button', { name: '저장 및 연결 테스트' }))

    expect(await within(card).findByRole('alert')).toHaveTextContent('연결 실패: connection refused')
    expect(api.bodiesOf('PUT', `/api/projects/${PID}/connection`)).toEqual([
      {
        db_type: 'postgresql',
        host: 'db.example.com',
        port: 5432,
        database: 'shop',
        username: 'reader',
        password: 's3cret!',
      },
    ])
    expect(api.bodiesOf('POST', `/api/projects/${PID}/connection/test`)).toHaveLength(1)
    // 저장 후 비밀번호 입력칸은 비우고 "저장됨"으로 안내한다
    expect(within(card).getByLabelText('비밀번호')).toHaveValue('')
    expect(within(card).getByText(/저장됨/)).toBeInTheDocument()
  })

  it('비밀번호를 비워두고 저장하면 password 필드를 보내지 않는다 (기존 비밀번호 유지)', async () => {
    const api = installFakeApi({ projects: [{ id: PID }], connections: { [PID]: savedConnection } })
    const { user } = renderApp(URL_)
    const card = await loadedCard('데이터베이스')

    await waitFor(() => expect(within(card).getByLabelText('호스트')).toHaveValue('db.internal'))
    await user.click(within(card).getByRole('button', { name: '저장 및 연결 테스트' }))

    await waitFor(() => expect(api.bodiesOf('PUT', `/api/projects/${PID}/connection`)).toHaveLength(1))
    expect(api.bodiesOf('PUT', `/api/projects/${PID}/connection`)[0]).not.toHaveProperty('password')
    expect(await within(card).findByRole('status')).toHaveTextContent('연결 성공')
  })

  it('DB 종류를 바꾸면 기본 포트를 따라가되, 직접 입력한 포트는 유지한다', async () => {
    installFakeApi({ projects: [{ id: PID }] })
    const { user } = renderApp(URL_)
    const card = await loadedCard('데이터베이스')
    const port = within(card).getByLabelText('포트')

    await user.selectOptions(within(card).getByLabelText('DB 종류'), 'mysql')
    expect(port).toHaveValue(3306)

    await user.clear(port)
    await user.type(port, '13306')
    await user.selectOptions(within(card).getByLabelText('DB 종류'), 'postgresql')
    expect(port).toHaveValue(13306)
  })

  it('서버 검증 오류를 보여준다', async () => {
    const api = installFakeApi({ projects: [{ id: PID }] })
    const { user } = renderApp(URL_)
    const card = await loadedCard('데이터베이스')
    // PUT이 422를 돌려주도록 한 번만 바꾼다
    const original = api.spy.getMockImplementation()!
    api.spy.mockImplementation(async (input, init) => {
      const req = input instanceof Request ? input : new Request(String(input), init)
      if (req.method === 'PUT') {
        return Response.json(
          { detail: [{ loc: ['body', 'port'], msg: 'Input should be less than or equal to 65535' }] },
          { status: 422 },
        )
      }
      return original(input, init)
    })

    await user.type(within(card).getByLabelText('호스트'), 'h')
    await user.type(within(card).getByLabelText('데이터베이스'), 'd')
    await user.type(within(card).getByLabelText('사용자'), 'u')
    await user.click(within(card).getByRole('button', { name: '저장 및 연결 테스트' }))

    expect(await within(card).findByRole('alert')).toHaveTextContent('port: Input should be less than')
    expect(api.requests.some((r) => r.path.endsWith('/connection/test'))).toBe(false)
  })
})

describe('LLM 설정 (BYOK)', () => {
  it('사용료가 사용자 계정에 청구된다는 안내를 보여준다', async () => {
    installFakeApi({ projects: [{ id: PID }] })
    renderApp(URL_)

    const card = await loadedCard('LLM')
    expect(card).toHaveTextContent('사용료는 입력한 키의 계정으로 청구')
    expect(card).toHaveTextContent('비용이 들지 않습니다')
    expect(within(card).getByRole('link', { name: /키 발급/ })).toHaveAttribute(
      'href',
      'https://console.anthropic.com/settings/keys',
    )
  })

  it('키 저장 → 모델 목록 표시 → 모델 선택 후 저장하면 연결 성공', async () => {
    const KEY = 'sk-ant-api03-REAL-SECRET'
    const api = installFakeApi({ projects: [{ id: PID }] })
    const { user } = renderApp(URL_)
    const card = await loadedCard('LLM')

    await user.type(within(card).getByLabelText('API 키'), KEY)
    await user.click(within(card).getByRole('button', { name: '저장 및 테스트' }))

    // 1차: 키만 저장 → 모델을 고르라는 안내와 모델 목록
    expect(await within(card).findByRole('alert')).toHaveTextContent('모델 2개 사용 가능')
    const modelSelect = within(card).getByLabelText('모델')
    expect(within(modelSelect).getAllByRole('option').map((o) => o.textContent)).toEqual([
      '모델 선택',
      'Claude Haiku 5.5 (claude-haiku-5-5)',
      'Claude Opus 5.5 (claude-opus-5-5)',
    ])

    // 2차: 모델 선택 후 저장 — 키는 다시 보내지 않는다
    await user.selectOptions(modelSelect, 'claude-opus-5-5')
    await user.click(within(card).getByRole('button', { name: '저장 및 테스트' }))

    expect(await within(card).findByRole('status')).toHaveTextContent('연결 성공')
    expect(within(card).getByText('도구 호출 지원')).toBeInTheDocument()
    expect(api.bodiesOf('PUT', `/api/projects/${PID}/llm`)).toEqual([
      { provider: 'anthropic', model: '', api_key: KEY },
      { provider: 'anthropic', model: 'claude-opus-5-5' },
    ])
    // 화면 어디에도 키 원문이 남지 않는다 (마스킹 값만 표시)
    expect(within(card).getByLabelText('API 키')).toHaveValue('')
    expect(document.body.innerHTML).not.toContain(KEY)
    expect(card).toHaveTextContent('sk-a****')
  })

  it('Ollama는 키 대신 서버 주소를 받고, 키를 보내지 않는다', async () => {
    const api = installFakeApi({ projects: [{ id: PID }] })
    const { user } = renderApp(URL_)
    const card = await loadedCard('LLM')

    await user.selectOptions(within(card).getByLabelText('제공사'), 'ollama')
    expect(within(card).queryByLabelText('API 키')).not.toBeInTheDocument()
    await user.type(within(card).getByLabelText('서버 주소'), 'http://gpu:11434')
    await user.type(within(card).getByLabelText('모델'), 'qwen3:8b')
    await user.click(within(card).getByRole('button', { name: '저장 및 테스트' }))

    await waitFor(() => expect(api.bodiesOf('PUT', `/api/projects/${PID}/llm`)).toHaveLength(1))
    expect(api.bodiesOf('PUT', `/api/projects/${PID}/llm`)[0]).toEqual({
      provider: 'ollama',
      model: 'qwen3:8b',
      base_url: 'http://gpu:11434',
    })
  })

  it('저장된 키가 있으면 입력 없이 다시 테스트할 수 있고, 다른 제공사로 바꾸면 키를 새로 요구한다', async () => {
    const saved: LLMConfig = {
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      base_url: null,
      has_api_key: true,
      api_key_masked: 'sk-a************',
      status: 'ok',
      last_error: null,
      last_tested_at: null,
      supports_tools: true,
    }
    const api = installFakeApi({ projects: [{ id: PID }], llm: { [PID]: saved } })
    const { user } = renderApp(URL_)
    const card = await loadedCard('LLM')

    expect(await within(card).findByText(/저장됨 \(sk-a\*+\)/)).toBeInTheDocument()
    expect(within(card).getByLabelText('API 키')).not.toBeRequired()
    await user.click(within(card).getByRole('button', { name: '저장 및 테스트' }))
    await waitFor(() => expect(api.bodiesOf('PUT', `/api/projects/${PID}/llm`)).toHaveLength(1))
    expect(api.bodiesOf('PUT', `/api/projects/${PID}/llm`)[0]).not.toHaveProperty('api_key')

    // 키가 필요한 다른 제공사로 바꾸면 저장된(Anthropic) 키를 쓸 수 없으므로 새 키를 요구한다
    await user.selectOptions(within(card).getByLabelText('제공사'), 'openai')
    expect(within(card).getByLabelText('API 키')).toBeRequired()
    expect(within(card).queryByText(/저장됨/)).not.toBeInTheDocument()
    expect(within(card).getByText('sk-로 시작')).toBeInTheDocument()
  })

  it.each([
    { supports: false, source: 'provider' as const, badge: '도구 호출 미지원 · 대화 기능에 사용할 수 없습니다' },
    { supports: true, source: 'heuristic' as const, badge: '도구 호출 지원 (추정)' },
    { supports: null, source: 'unknown' as const, badge: '도구 호출 지원 여부 확인 불가' },
  ])('도구 호출 지원 여부를 표시한다: $badge', async ({ supports, source, badge }) => {
    installFakeApi({
      projects: [{ id: PID }],
      llmTest: () => ({
        ok: true,
        latency_ms: 5,
        error: null,
        error_kind: null,
        models: [{ id: 'm1', display_name: 'm1', supports_tools: supports, capability_source: source }],
        model_found: true,
        supports_tools: supports,
        capability_source: source,
      }),
    })
    const { user } = renderApp(URL_)
    const card = await loadedCard('LLM')

    await user.type(within(card).getByLabelText('API 키'), 'sk-ant-x')
    await user.type(within(card).getByLabelText('모델'), 'm1')
    await user.click(within(card).getByRole('button', { name: '저장 및 테스트' }))

    expect(await within(card).findByText(badge)).toBeInTheDocument()
  })

  it('키가 유효하지 않으면 오류를 보여준다', async () => {
    installFakeApi({
      projects: [{ id: PID }],
      llmTest: () => ({
        ok: false,
        latency_ms: null,
        error: 'API 키가 유효하지 않습니다.',
        error_kind: 'auth',
        models: [],
        model_found: null,
        supports_tools: null,
        capability_source: 'unknown',
      }),
    })
    const { user } = renderApp(URL_)
    const card = await loadedCard('LLM')

    await user.type(within(card).getByLabelText('API 키'), 'sk-ant-wrong')
    await user.click(within(card).getByRole('button', { name: '저장 및 테스트' }))

    expect(await within(card).findByRole('alert')).toHaveTextContent('연결 실패: API 키가 유효하지 않습니다.')
  })
})

it('없는 프로젝트는 404를 보여준다', async () => {
  installFakeApi()
  renderApp('/projects/ghost/connection')
  expect(await screen.findByText('페이지를 찾을 수 없습니다')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: '데이터베이스' })).not.toBeInTheDocument()
})
