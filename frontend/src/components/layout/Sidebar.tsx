import { Plus, Search, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { HealthIndicator } from './HealthIndicator'

export function Sidebar() {
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
          disabled
          title="새 프로젝트 (Phase 1)"
          className="text-muted-foreground"
        >
          <Plus />
        </Button>
      </div>

      <div className="px-3 py-2">
        <label className="flex items-center gap-2 rounded-md bg-sidebar-accent px-2.5 py-1.5">
          <Search className="size-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="검색..."
            className="flex-1 bg-transparent text-xs text-sidebar-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      {/* 프로젝트 트리는 Phase 1에서 API 연동 후 구현 */}
      <nav className="flex-1 overflow-y-auto px-4 py-6 text-center text-xs text-muted-foreground">
        아직 프로젝트가 없습니다
      </nav>

      <div className="border-t border-sidebar-border px-4 py-3">
        <HealthIndicator />
      </div>
    </aside>
  )
}
