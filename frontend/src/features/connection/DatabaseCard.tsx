import { Loader2, RefreshCw } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import {
  useConnection,
  useRefreshSchema,
  useSaveConnection,
  useTestConnection,
  type Connection,
  type ConnectionInput,
} from '@/api/projects'
import { Card, Field, NativeSelect, ResultBanner } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SchemaList } from './SchemaList'

type DbType = ConnectionInput['db_type']

const DB_TYPES: { id: DbType; label: string; port: number }[] = [
  { id: 'postgresql', label: 'PostgreSQL', port: 5432 },
  { id: 'mysql', label: 'MySQL', port: 3306 },
]

type FormState = Omit<ConnectionInput, 'port' | 'password'> & { port: string; password: string }

function initialForm(c: Connection | null | undefined): FormState {
  return {
    db_type: c?.db_type ?? 'postgresql',
    host: c?.host ?? '',
    port: String(c?.port ?? 5432),
    database: c?.database ?? '',
    username: c?.username ?? '',
    password: '',
  }
}

export function DatabaseCard({ projectId }: { projectId: string }) {
  const { data: connection, isPending } = useConnection(projectId)
  if (isPending) return <Card title="데이터베이스">불러오는 중…</Card>
  // 폼은 처음 불러온 값으로 한 번만 초기화한다. (저장 후 다시 마운트하면 테스트 결과가 사라진다)
  return <DatabaseForm projectId={projectId} connection={connection} />
}

function DatabaseForm({
  projectId,
  connection,
}: {
  projectId: string
  connection: Connection | null | undefined
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(connection))
  const save = useSaveConnection(projectId)
  const test = useTestConnection(projectId)
  const refresh = useRefreshSchema(projectId)

  const busy = save.isPending || test.isPending
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  function changeType(dbType: DbType) {
    const prevDefault = DB_TYPES.find((t) => t.id === form.db_type)?.port
    const nextDefault = DB_TYPES.find((t) => t.id === dbType)!.port
    // 포트를 직접 바꾸지 않았다면 DB 종류의 기본 포트로 맞춘다
    setForm((f) => ({
      ...f,
      db_type: dbType,
      port: f.port === String(prevDefault) ? String(nextDefault) : f.port,
    }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    test.reset()
    const body: ConnectionInput = {
      db_type: form.db_type,
      host: form.host.trim(),
      port: Number(form.port),
      database: form.database.trim(),
      username: form.username.trim(),
      // 비워두면 저장된 비밀번호를 유지한다 (필드 생략)
      ...(form.password ? { password: form.password } : {}),
    }
    try {
      await save.mutateAsync(body)
      setForm((f) => ({ ...f, password: '' }))
      await test.mutateAsync()
    } catch {
      // 오류는 save/test의 error 상태로 화면에 표시한다
    }
  }

  const testResult = test.data
  const showSchemaAction = connection?.status === 'ok' || testResult?.ok

  return (
    <Card
      title="데이터베이스"
      description="조회 전용(읽기 전용) 계정 사용을 권장합니다. auto-viz도 조회 쿼리만 실행합니다."
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-6 gap-3">
        <Field id="db-type" label="DB 종류" className="col-span-2">
          <NativeSelect
            id="db-type"
            value={form.db_type}
            onChange={(e) => changeType(e.target.value as DbType)}
          >
            {DB_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="db-host" label="호스트" className="col-span-3">
          <Input
            id="db-host"
            required
            placeholder="db.example.com"
            value={form.host}
            onChange={(e) => set('host', e.target.value)}
          />
        </Field>
        <Field id="db-port" label="포트" className="col-span-1">
          <Input
            id="db-port"
            required
            type="number"
            min={1}
            max={65535}
            value={form.port}
            onChange={(e) => set('port', e.target.value)}
          />
        </Field>
        <Field id="db-name" label="데이터베이스" className="col-span-2">
          <Input
            id="db-name"
            required
            value={form.database}
            onChange={(e) => set('database', e.target.value)}
          />
        </Field>
        <Field id="db-user" label="사용자" className="col-span-2">
          <Input
            id="db-user"
            required
            autoComplete="off"
            value={form.username}
            onChange={(e) => set('username', e.target.value)}
          />
        </Field>
        <Field
          id="db-password"
          label="비밀번호"
          className="col-span-2"
          hint={connection?.has_password ? '저장됨 · 바꿀 때만 입력하세요' : undefined}
        >
          <Input
            id="db-password"
            type="password"
            autoComplete="new-password"
            placeholder={connection?.has_password ? '••••••••' : ''}
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
          />
        </Field>

        <div className="col-span-6 flex items-center gap-2">
          <Button type="submit" size="sm" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            저장 및 연결 테스트
          </Button>
          {connection && !busy && (
            <Button type="button" variant="ghost" size="sm" onClick={() => test.mutate()}>
              다시 테스트
            </Button>
          )}
        </div>
      </form>

      <div className="mt-4 space-y-3">
        {save.isError && <ResultBanner ok={false}>{save.error.message}</ResultBanner>}
        {testResult ? (
          testResult.ok ? (
            <ResultBanner ok>
              연결 성공 · {testResult.latency_ms}ms
              {testResult.server_version && (
                <span className="block truncate opacity-80">{testResult.server_version}</span>
              )}
            </ResultBanner>
          ) : (
            <ResultBanner ok={false}>연결 실패: {testResult.error}</ResultBanner>
          )
        ) : (
          connection?.status === 'error' &&
          connection.last_error && (
            <ResultBanner ok={false}>마지막 테스트 실패: {connection.last_error}</ResultBanner>
          )
        )}
        {test.isError && <ResultBanner ok={false}>{test.error.message}</ResultBanner>}
      </div>

      {showSchemaAction && (
        <div className="mt-5 border-t pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold">
              스키마
              {connection?.table_count != null && (
                <span className="ml-1.5 font-normal text-muted-foreground">
                  테이블 {connection.table_count}개
                </span>
              )}
            </h3>
            <Button
              variant="outline"
              size="xs"
              disabled={refresh.isPending}
              onClick={() => refresh.mutate()}
            >
              <RefreshCw className={refresh.isPending ? 'animate-spin' : undefined} />
              {connection?.schema_updated_at ? '스키마 다시 가져오기' : '스키마 가져오기'}
            </Button>
          </div>
          {refresh.isError && <ResultBanner ok={false}>{refresh.error.message}</ResultBanner>}
          <SchemaList projectId={projectId} hasSchema={!!connection?.schema_updated_at} />
        </div>
      )}
    </Card>
  )
}
