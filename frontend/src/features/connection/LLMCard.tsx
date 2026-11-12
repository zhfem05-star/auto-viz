import { ExternalLink, Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import {
  useLLM,
  useProviders,
  useSaveLLM,
  useTestLLM,
  type LLMConfig,
  type LLMConfigInput,
  type LLMTest,
  type Provider,
} from '@/api/projects'
import { Card, Field, NativeSelect, ResultBanner } from '@/components/form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type ProviderId = LLMConfigInput['provider']

export function LLMCard({ projectId }: { projectId: string }) {
  const { data: config, isPending } = useLLM(projectId)
  const { data: providers } = useProviders()
  if (isPending || !providers) return <Card title="LLM">불러오는 중…</Card>
  return <LLMForm projectId={projectId} config={config} providers={providers} />
}

function LLMForm({
  projectId,
  config,
  providers,
}: {
  projectId: string
  config: LLMConfig | null | undefined
  providers: Provider[]
}) {
  const [provider, setProvider] = useState<ProviderId>(config?.provider ?? 'anthropic')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(config?.model ?? '')
  const [baseUrl, setBaseUrl] = useState(config?.base_url ?? '')
  const save = useSaveLLM(projectId)
  const test = useTestLLM(projectId)

  const meta = providers.find((p) => p.id === provider)!
  const busy = save.isPending || test.isPending
  // 저장된 키는 같은 제공사일 때만 유효하다 (제공사를 바꾸면 서버가 키를 지운다)
  const hasStoredKey = config?.has_api_key && config.provider === provider
  const models = test.data?.ok ? test.data.models : []

  function changeProvider(next: ProviderId) {
    setProvider(next)
    setApiKey('')
    setModel('')
    setBaseUrl('')
    test.reset()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const body: LLMConfigInput = {
      provider,
      model: model.trim(),
      ...(meta.base_url_editable ? { base_url: baseUrl.trim() || null } : {}),
      // 비워두면 저장된 키를 유지한다 (필드 생략)
      ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
    }
    try {
      await save.mutateAsync(body)
      setApiKey('')
      await test.mutateAsync()
    } catch {
      // 오류는 save/test의 error 상태로 화면에 표시한다
    }
  }

  return (
    <Card
      title="LLM"
      description={
        <>
          본인의 API 키를 사용합니다. 사용료는 입력한 키의 계정으로 청구되며, auto-viz는 키를
          암호화해 이 컴퓨터에만 저장합니다. 연결 테스트는 모델 목록만 조회하므로 비용이 들지
          않습니다.
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-6 gap-3">
        <Field id="llm-provider" label="제공사" className="col-span-2">
          <NativeSelect
            id="llm-provider"
            value={provider}
            onChange={(e) => changeProvider(e.target.value as ProviderId)}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        </Field>

        {meta.requires_api_key ? (
          <Field
            id="llm-key"
            label="API 키"
            className="col-span-4"
            hint={
              <span className="flex flex-wrap items-center gap-x-2">
                {hasStoredKey ? (
                  <span>저장됨 ({config?.api_key_masked}) · 바꿀 때만 입력하세요</span>
                ) : (
                  meta.key_hint && <span>{meta.key_hint}</span>
                )}
                {meta.key_url && (
                  <a
                    href={meta.key_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-brand hover:underline"
                  >
                    키 발급 <ExternalLink className="size-2.5" />
                  </a>
                )}
              </span>
            }
          >
            <Input
              id="llm-key"
              type="password"
              autoComplete="off"
              required={!hasStoredKey}
              placeholder={hasStoredKey ? '••••••••' : ''}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </Field>
        ) : (
          <Field
            id="llm-base-url"
            label="서버 주소"
            className="col-span-4"
            hint="Docker로 실행 중이면 http://host.docker.internal:11434 를 사용하세요."
          >
            <Input
              id="llm-base-url"
              placeholder={meta.default_base_url}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </Field>
        )}

        <Field id="llm-model" label="모델" className="col-span-6">
          {models.length > 0 ? (
            <NativeSelect id="llm-model" value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="">모델 선택</option>
              {!models.some((m) => m.id === model) && model && (
                <option value={model}>{model} (목록에 없음)</option>
              )}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name !== m.id ? `${m.display_name} (${m.id})` : m.id}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <Input
              id="llm-model"
              placeholder="테스트하면 사용 가능한 모델 목록이 표시됩니다"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          )}
        </Field>

        <div className="col-span-6 flex items-center gap-2">
          <Button type="submit" size="sm" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            저장 및 테스트
          </Button>
          {config && config.provider === provider && <ToolSupportBadge config={config} test={test.data} />}
        </div>
      </form>

      <div className="mt-4 space-y-3">
        {save.isError && <ResultBanner ok={false}>{save.error.message}</ResultBanner>}
        {test.isError && <ResultBanner ok={false}>{test.error.message}</ResultBanner>}
        <TestSummary test={test.data} config={config} />
      </div>
    </Card>
  )
}

function TestSummary({ test, config }: { test: LLMTest | undefined; config: LLMConfig | null | undefined }) {
  if (!test) {
    return config?.status === 'error' && config.last_error ? (
      <ResultBanner ok={false}>마지막 테스트 실패: {config.last_error}</ResultBanner>
    ) : null
  }
  if (!test.ok) return <ResultBanner ok={false}>연결 실패: {test.error}</ResultBanner>
  if (!test.model_found) {
    return (
      <ResultBanner ok={false}>
        API 키 확인 완료 · 모델 {test.models.length}개 사용 가능.{' '}
        {config?.model ? `‘${config.model}’ 모델을 찾을 수 없습니다. ` : ''}
        목록에서 모델을 선택한 뒤 다시 저장하세요.
      </ResultBanner>
    )
  }
  return <ResultBanner ok>연결 성공 · {test.latency_ms}ms</ResultBanner>
}

function ToolSupportBadge({ config, test }: { config: LLMConfig; test: LLMTest | undefined }) {
  if (config.status !== 'ok') return null
  const estimated = test?.capability_source === 'heuristic'
  if (config.supports_tools === true) {
    return (
      <Badge variant="secondary" className="text-success">
        도구 호출 지원{estimated && ' (추정)'}
      </Badge>
    )
  }
  if (config.supports_tools === false) {
    return (
      <Badge variant="destructive">도구 호출 미지원 · 대화 기능에 사용할 수 없습니다</Badge>
    )
  }
  return <Badge variant="outline">도구 호출 지원 여부 확인 불가</Badge>
}
