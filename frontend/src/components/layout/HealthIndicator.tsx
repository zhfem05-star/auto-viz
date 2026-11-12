import { useHealth } from '@/api/health'
import { cn } from '@/lib/utils'

export function HealthIndicator() {
  const { data, isPending, isError } = useHealth()

  const state = isPending ? 'pending' : isError || data?.status !== 'ok' ? 'error' : 'ok'
  const label = { pending: 'API 확인 중', error: 'API 연결 안 됨', ok: `API 연결됨 · v${data?.version}` }[state]

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
      <span
        className={cn(
          'size-1.5 rounded-full',
          state === 'ok' && 'bg-success',
          state === 'error' && 'bg-destructive',
          state === 'pending' && 'bg-muted-foreground animate-pulse',
        )}
      />
      {label}
    </div>
  )
}
