import { Database, Layers, LayoutDashboard, Library, MessageSquare, type LucideIcon } from 'lucide-react'

export type ProjectSection = 'chat' | 'library' | 'dashboard' | 'datasets' | 'connection'

export const SECTIONS: { id: ProjectSection; label: string; icon: LucideIcon }[] = [
  { id: 'chat', label: '대화', icon: MessageSquare },
  { id: 'library', label: '라이브러리', icon: Library },
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { id: 'datasets', label: '데이터셋', icon: Layers },
  { id: 'connection', label: '연결 설정', icon: Database },
]

export function findSection(id: string | undefined) {
  return SECTIONS.find((s) => s.id === id)
}
