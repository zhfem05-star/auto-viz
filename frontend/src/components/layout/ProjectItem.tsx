import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Lock,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { useDeleteProject, useUpdateProject, type Project } from '@/api/projects'
import { SECTIONS } from '@/app/sections'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { StatusDot } from './StatusDot'

type Props = {
  project: Project
  isActive: boolean
  activeSection: string | undefined
}

export function ProjectItem({ project, isActive, activeSection }: Props) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(isActive)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(project.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // 메뉴가 닫히며 포커스를 트리거로 되돌린 뒤에 편집을 시작해야 입력칸이 바로 blur되지 않는다.
  const renameRequested = useRef(false)
  const update = useUpdateProject()
  const remove = useDeleteProject()

  const isExpanded = expanded || isActive
  const llmReady = project.llm_status === 'ok'

  function startEdit() {
    setName(project.name)
    setEditing(true)
  }

  function commitEdit() {
    setEditing(false)
    const next = name.trim()
    if (next && next !== project.name) update.mutate({ id: project.id, name: next })
  }

  async function handleDelete() {
    await remove.mutateAsync(project.id)
    setConfirmDelete(false)
    if (isActive) navigate('/')
  }

  return (
    <li>
      <div className="group flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-sidebar-accent">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          aria-expanded={isExpanded}
          onClick={() => setExpanded(!isExpanded)}
          onDoubleClick={startEdit}
        >
          <span style={{ color: project.color }}>
            {isExpanded ? <FolderOpen className="size-3.5" /> : <Folder className="size-3.5" />}
          </span>
          {editing ? (
            <input
              autoFocus
              aria-label="프로젝트 이름"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit()
                if (e.key === 'Escape') setEditing(false)
              }}
              onClick={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 border-b border-brand bg-transparent text-xs font-semibold text-sidebar-primary outline-none"
            />
          ) : (
            <span className="flex-1 truncate text-xs font-semibold text-sidebar-primary">
              {project.name}
            </span>
          )}
        </button>

        <span className="flex shrink-0 items-center gap-1">
          <StatusDot kind="llm" status={project.llm_status} />
          <StatusDot kind="db" status={project.connection_status} />
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`${project.name} 메뉴`}
            className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-white/10 focus-visible:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-36"
            onCloseAutoFocus={(e) => {
              if (!renameRequested.current) return
              renameRequested.current = false
              e.preventDefault()
              startEdit()
            }}
          >
            <DropdownMenuItem onSelect={() => (renameRequested.current = true)}>
              <Pencil /> 이름 변경
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 /> 삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-muted-foreground">
          {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </span>
      </div>

      {isExpanded && (
        <ul className="mb-1 ml-3 mt-0.5 border-l border-sidebar-border pl-1.5">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <NavLink
                to={`/projects/${project.id}/${id}`}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-sidebar-accent',
                  activeSection === id && 'bg-sidebar-accent font-medium text-sidebar-primary',
                )}
              >
                <Icon className="size-3.5" />
                {label}
                {id === 'chat' && !llmReady && (
                  <Lock className="ml-auto size-2.5 text-destructive" aria-label="LLM 설정 필요" />
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>프로젝트를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              ‘{project.name}’의 DB 연결 정보와 LLM 설정(API 키 포함)이 함께 삭제됩니다. 연결된
              DB의 데이터에는 영향이 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}
