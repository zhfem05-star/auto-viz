import { cn } from '@/lib/utils'
import type { Project } from '@/api/projects'

type Status = Project['connection_status']

const LABEL: Record<NonNullable<Status> | 'none', string> = {
  none: '설정 안 됨',
  untested: '테스트 전',
  ok: '연결됨',
  error: '오류',
}

/** 사이드바의 연결 상태 점. kind: llm(LLM 설정) / db(DB 연결) */
export function StatusDot({ kind, status }: { kind: 'llm' | 'db'; status: Status }) {
  const label = `${kind === 'llm' ? 'LLM' : 'DB'}: ${LABEL[status ?? 'none']}`
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'size-1.5 rounded-full',
        kind === 'llm' && 'rounded-[2px]',
        status === 'ok' && 'bg-success',
        status === 'error' && 'bg-destructive',
        (status === 'untested' || status === null) && 'bg-muted-foreground/50',
      )}
    />
  )
}
