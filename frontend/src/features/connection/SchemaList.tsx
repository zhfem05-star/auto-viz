import { ChevronRight, KeyRound, Link2 } from 'lucide-react'
import { useSchema } from '@/api/projects'

const fmt = new Intl.NumberFormat('ko-KR')

export function SchemaList({ projectId, hasSchema }: { projectId: string; hasSchema: boolean }) {
  const { data: schema, isPending } = useSchema(projectId, hasSchema)

  if (!hasSchema) {
    return (
      <p className="text-xs text-muted-foreground">
        스키마를 가져오면 LLM이 테이블 구조를 참고해 쿼리를 만듭니다.
      </p>
    )
  }
  if (isPending) return <p className="text-xs text-muted-foreground">불러오는 중…</p>
  if (!schema || schema.tables.length === 0) {
    return <p className="text-xs text-muted-foreground">조회 가능한 테이블이 없습니다.</p>
  }

  return (
    <div className="space-y-1">
      {schema.truncated && (
        <p className="text-[11px] text-muted-foreground">
          테이블이 많아 앞의 {schema.tables.length}개만 가져왔습니다.
        </p>
      )}
      <ul className="max-h-80 overflow-y-auto rounded-md border text-xs">
        {schema.tables.map((t) => {
          const fullName = t.schema ? `${t.schema}.${t.name}` : t.name
          return (
            <li key={fullName} className="border-b last:border-b-0">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 hover:bg-accent/50">
                  <ChevronRight className="size-3 text-muted-foreground transition-transform group-open:rotate-90" />
                  <span className="font-mono">{fullName}</span>
                  <span className="text-muted-foreground">컬럼 {t.columns.length}</span>
                  {t.row_estimate != null && (
                    <span className="ml-auto text-muted-foreground">
                      약 {fmt.format(t.row_estimate)}행
                    </span>
                  )}
                </summary>
                <ul className="space-y-0.5 px-8 pb-2">
                  {t.comment && <li className="pb-1 text-muted-foreground">{t.comment}</li>}
                  {t.columns.map((c) => {
                    const fk = t.foreign_keys.find((f) => f.columns.includes(c.name))
                    return (
                      <li key={c.name} className="flex items-center gap-2">
                        <span className="font-mono">{c.name}</span>
                        <span className="text-muted-foreground">{c.type}</span>
                        {c.primary_key && <KeyRound className="size-3 text-brand" aria-label="기본 키" />}
                        {fk && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Link2 className="size-3" aria-hidden />
                            {fk.ref_table}.{fk.ref_columns.join(', ')}
                          </span>
                        )}
                        {!c.nullable && <span className="text-muted-foreground">NOT NULL</span>}
                      </li>
                    )
                  })}
                </ul>
              </details>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
