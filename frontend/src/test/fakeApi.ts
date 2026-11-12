import { vi } from 'vitest'
import type {
  Connection,
  ConnectionInput,
  ConnectionTest,
  LLMConfig,
  LLMConfigInput,
  LLMTest,
  Project,
  Provider,
} from '@/api/projects'

export type RecordedRequest = { method: string; path: string; body: unknown }

type Options = {
  /** GET /api/health 응답 (기본: 정상). Error를 주면 네트워크 오류로 처리한다. */
  health?: () => Response | Error
  projects?: Partial<Project>[]
  connections?: Record<string, Connection>
  llm?: Record<string, LLMConfig>
  /** POST .../connection/test 결과 */
  connectionTest?: (projectId: string) => ConnectionTest
  /** POST .../llm/test 결과 */
  llmTest?: (config: LLMConfig) => LLMTest
}

export const PROVIDERS: Provider[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    requires_api_key: true,
    key_hint: 'sk-ant-로 시작',
    key_url: 'https://console.anthropic.com/settings/keys',
    default_base_url: 'https://api.anthropic.com',
    base_url_editable: false,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    requires_api_key: true,
    key_hint: 'sk-로 시작',
    key_url: 'https://platform.openai.com/api-keys',
    default_base_url: 'https://api.openai.com/v1',
    base_url_editable: false,
  },
  {
    id: 'ollama',
    label: 'Ollama (로컬)',
    requires_api_key: false,
    key_hint: null,
    key_url: null,
    default_base_url: 'http://localhost:11434',
    base_url_editable: true,
  },
]

const now = '2026-11-12T00:00:00Z'

export function makeProject(p: Partial<Project> = {}): Project {
  return {
    id: p.id ?? `p${Math.random().toString(36).slice(2, 8)}`,
    name: p.name ?? '새 프로젝트',
    color: p.color ?? '#c9703a',
    created_at: now,
    updated_at: now,
    connection_status: p.connection_status ?? null,
    llm_status: p.llm_status ?? null,
  }
}

/**
 * 백엔드 동작을 흉내 내는 상태 있는 fetch mock.
 * 실제 서버 규칙(비밀번호/키 생략 시 유지, 제공사 변경 시 키 삭제)을 따른다.
 * 정의되지 않은 요청은 예외를 던져 테스트를 실패시킨다.
 */
export function installFakeApi(options: Options = {}) {
  const projects = (options.projects ?? []).map(makeProject)
  const connections: Record<string, Connection> = { ...options.connections }
  const llm: Record<string, LLMConfig> = { ...options.llm }
  const requests: RecordedRequest[] = []
  let seq = 0

  const json = (body: unknown, status = 200) =>
    status === 204 ? new Response(null, { status }) : Response.json(body, { status })
  const notFound = () => json({ detail: '찾을 수 없습니다.' }, 404)
  const find = (id: string) => projects.find((p) => p.id === id)

  async function handle(method: string, path: string, body: unknown): Promise<Response> {
    if (method === 'GET' && path === '/api/health') {
      const res = options.health?.() ?? json({ status: 'ok', version: '0.1.0', database: 'ok' })
      if (res instanceof Error) throw res
      return res
    }
    if (method === 'GET' && path === '/api/llm/providers') return json(PROVIDERS)
    if (path === '/api/projects') {
      if (method === 'GET') return json(projects)
      if (method === 'POST') {
        const p = makeProject({ id: `new${++seq}`, ...(body as object) })
        projects.push(p)
        return json(p, 201)
      }
    }

    const m = path.match(/^\/api\/projects\/([^/]+)(\/.*)?$/)
    if (!m) throw new Error(`fakeApi: 처리하지 않는 요청 ${method} ${path}`)
    const [, id, rest = ''] = m
    const project = find(id)
    if (!project) return notFound()

    switch (`${method} ${rest}`) {
      case 'GET ':
        return json(project)
      case 'PATCH ':
        Object.assign(project, body)
        return json(project)
      case 'DELETE ':
        projects.splice(projects.indexOf(project), 1)
        return json(null, 204)

      case 'GET /connection':
        return json(connections[id] ?? null)
      case 'PUT /connection': {
        const input = body as ConnectionInput
        const prev = connections[id]
        connections[id] = {
          db_type: input.db_type,
          host: input.host,
          port: input.port,
          database: input.database,
          username: input.username,
          has_password: input.password === undefined || input.password === null
            ? (prev?.has_password ?? false)
            : input.password !== '',
          status: 'untested',
          last_error: null,
          last_tested_at: null,
          schema_updated_at: null,
          table_count: null,
        }
        project.connection_status = 'untested'
        return json(connections[id])
      }
      case 'POST /connection/test': {
        const result = options.connectionTest?.(id) ?? {
          ok: true,
          latency_ms: 12,
          server_version: 'PostgreSQL 16.4',
          error: null,
        }
        connections[id] = {
          ...connections[id],
          status: result.ok ? 'ok' : 'error',
          last_error: result.error,
        }
        project.connection_status = connections[id].status
        return json(result)
      }

      case 'GET /llm':
        return json(llm[id] ?? null)
      case 'PUT /llm': {
        const input = body as LLMConfigInput
        const prev = llm[id]
        const keep = input.api_key == null ? prev?.provider === input.provider && prev.has_api_key : !!input.api_key
        llm[id] = {
          provider: input.provider,
          model: input.model ?? '',
          base_url: input.base_url ?? null,
          has_api_key: input.provider === 'ollama' ? false : !!keep,
          api_key_masked: keep && input.provider !== 'ollama' ? 'sk-a************' : null,
          status: 'untested',
          last_error: null,
          last_tested_at: null,
          supports_tools: null,
        }
        project.llm_status = 'untested'
        return json(llm[id])
      }
      case 'POST /llm/test': {
        const cfg = llm[id]
        const result = options.llmTest?.(cfg) ?? defaultLLMTest(cfg)
        const usable = result.ok && result.model_found === true
        llm[id] = { ...cfg, status: usable ? 'ok' : 'error', supports_tools: result.supports_tools }
        project.llm_status = llm[id].status
        return json(result)
      }
    }
    throw new Error(`fakeApi: 처리하지 않는 요청 ${method} ${path}`)
  }

  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const request = input instanceof Request ? input : new Request(String(input))
    const url = new URL(request.url)
    const text = await request.text()
    const body = text ? JSON.parse(text) : undefined
    requests.push({ method: request.method, path: url.pathname, body })
    return handle(request.method, url.pathname, body)
  })

  return {
    spy,
    requests,
    projects,
    connections,
    llm,
    /** 특정 method+path로 보낸 요청 본문들 */
    bodiesOf: (method: string, path: string) =>
      requests.filter((r) => r.method === method && r.path === path).map((r) => r.body),
  }
}

const MODELS = [
  { id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5', supports_tools: true, capability_source: 'provider' as const },
  { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', supports_tools: true, capability_source: 'provider' as const },
]

function defaultLLMTest(cfg: LLMConfig): LLMTest {
  const found = MODELS.some((m) => m.id === cfg.model)
  return {
    ok: true,
    latency_ms: 30,
    error: null,
    error_kind: null,
    models: MODELS,
    model_found: cfg.model ? found : false,
    supports_tools: found ? true : null,
    capability_source: found ? 'provider' : 'unknown',
  }
}
