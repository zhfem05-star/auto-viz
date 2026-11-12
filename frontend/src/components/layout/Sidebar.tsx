import { Plus, Search, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useMatch, useNavigate } from 'react-router'
import { useCreateProject, useProjects } from '@/api/projects'
import { Button } from '@/components/ui/button'
import { HealthIndicator } from './HealthIndicator'
import { ProjectItem } from './ProjectItem'

export function Sidebar() {
  const navigate = useNavigate()
  const match = useMatch('/projects/:projectId/:section')
  const activeProjectId = match?.params.projectId
  const activeSection = match?.params.section

  const { data: projects, isPending, isError } = useProjects()
  const createProject = useCreateProject()
  const [query, setQuery] = useState('')

  const filtered = (projects ?? []).filter((p) =>
    p.name.toLowerCase().includes(query.trim().toLowerCase()),
  )

  async function handleCreate() {
    const project = await createProject.mutateAsync({})
    // 새 프로젝트는 연결 설정부터 시작한다
    navigate(`/projects/${project.id}/connection`)
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3.5">
        <Link to="/" className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-brand" />
          <span className="text-sm font-semibold tracking-tight text-sidebar-primary">auto-viz</span>
        </Link>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="새 프로젝트"
          title="새 프로젝트"
          className="text-muted-foreground"
          disabled={createProject.isPending}
          onClick={handleCreate}
        >
          <Plus />
        </Button>
      </div>

      <div className="px-3 py-2">
        <label className="flex items-center gap-2 rounded-md bg-sidebar-accent px-2.5 py-1.5">
          <Search className="size-3 text-muted-foreground" />
          <input
            type="search"
            aria-label="프로젝트 검색"
            placeholder="검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-xs text-sidebar-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" aria-label="검색어 지우기" onClick={() => setQuery('')}>
              <X className="size-3 text-muted-foreground" />
            </button>
          )}
        </label>
      </div>

      <nav aria-label="프로젝트" className="flex-1 overflow-y-auto px-2 pb-2">
        {isPending ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">불러오는 중…</p>
        ) : isError ? (
          <p className="px-2 py-6 text-center text-xs text-destructive">프로젝트를 불러오지 못했습니다</p>
        ) : projects.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            <p>아직 프로젝트가 없습니다</p>
            <button
              type="button"
              className="mt-2 text-brand hover:underline"
              onClick={handleCreate}
              disabled={createProject.isPending}
            >
              첫 프로젝트 만들기
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">검색 결과가 없습니다</p>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((project) => (
              <ProjectItem
                key={project.id}
                project={project}
                isActive={project.id === activeProjectId}
                activeSection={project.id === activeProjectId ? activeSection : undefined}
              />
            ))}
          </ul>
        )}
      </nav>

      <div className="border-t border-sidebar-border px-4 py-3">
        <HealthIndicator />
      </div>
    </aside>
  )
}
