import { useParams } from 'react-router'
import { findSection } from '@/app/sections'
import { NotFoundPage } from './NotFoundPage'

/** 프로젝트 섹션 자리표시자. 각 섹션은 이후 Phase에서 실제 화면으로 교체된다. */
export function SectionPage() {
  const { projectId, section } = useParams()
  const meta = findSection(section)
  if (!meta) return <NotFoundPage />

  const Icon = meta.icon
  return (
    <>
      <header className="flex items-center gap-2 border-b px-6 py-3.5">
        <Icon className="size-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold">{meta.label}</h1>
        <span className="text-xs text-muted-foreground">· {projectId}</span>
      </header>
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        준비 중인 화면입니다
      </div>
    </>
  )
}
