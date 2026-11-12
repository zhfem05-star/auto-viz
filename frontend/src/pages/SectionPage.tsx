import { useParams } from 'react-router'
import { ApiError } from '@/api/client'
import { useProject } from '@/api/projects'
import { findSection } from '@/app/sections'
import { ConnectionPage } from '@/features/connection/ConnectionPage'
import { NotFoundPage } from './NotFoundPage'

export function SectionPage() {
  const { projectId = '', section } = useParams()
  const meta = findSection(section)
  const project = useProject(projectId)

  if (!meta) return <NotFoundPage />
  if (project.error instanceof ApiError && project.error.status === 404) return <NotFoundPage />

  const Icon = meta.icon
  return (
    <>
      <header className="flex items-center gap-2 border-b px-6 py-3.5">
        <Icon className="size-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold">{meta.label}</h1>
        {project.data && (
          <span className="text-xs text-muted-foreground">· {project.data.name}</span>
        )}
      </header>
      <div className="flex flex-1 flex-col overflow-y-auto">
        {meta.id === 'connection' ? (
          <ConnectionPage projectId={projectId} />
        ) : (
          // 나머지 섹션은 이후 Phase에서 구현
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            준비 중인 화면입니다
          </div>
        )}
      </div>
    </>
  )
}
