import { CheckCircle2, AlertCircle } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export function Field({
  id,
  label,
  hint,
  children,
  className,
}: {
  id: string
  label: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** 네이티브 select (접근성·테스트 용이). shadcn Input과 같은 모양으로 맞춘다. */
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-9 w-full rounded-md border border-input bg-input/30 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export function Card({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-label={title} className="rounded-xl border bg-card p-5">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  )
}

export function ResultBanner({ ok, children }: { ok: boolean; children: ReactNode }) {
  const Icon = ok ? CheckCircle2 : AlertCircle
  return (
    <div
      role={ok ? 'status' : 'alert'}
      className={cn(
        'flex items-start gap-2 rounded-md px-3 py-2 text-xs',
        ok ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
      )}
    >
      <Icon className="mt-px size-3.5 shrink-0" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  )
}
