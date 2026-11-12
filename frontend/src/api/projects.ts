import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap, type Schemas } from './client'

export type Project = Schemas['ProjectOut']
export type Connection = Schemas['ConnectionOut']
export type ConnectionInput = Schemas['ConnectionIn']
export type ConnectionTest = Schemas['ConnectionTestOut']
export type DbSchema = Schemas['SchemaOut']
export type Provider = Schemas['ProviderOut']
export type LLMConfig = Schemas['LLMConfigOut']
export type LLMConfigInput = Schemas['LLMConfigIn']
export type LLMTest = Schemas['LLMTestOut']

export const keys = {
  projects: ['projects'] as const,
  project: (id: string) => ['projects', id] as const,
  connection: (id: string) => ['projects', id, 'connection'] as const,
  schema: (id: string) => ['projects', id, 'connection', 'schema'] as const,
  llm: (id: string) => ['projects', id, 'llm'] as const,
  providers: ['llm', 'providers'] as const,
}

const path = (projectId: string) => ({ params: { path: { project_id: projectId } } })

// ── 프로젝트 ──────────────────────────────────────────────────────────────
export function useProjects() {
  return useQuery({
    queryKey: keys.projects,
    queryFn: () => unwrap(api.GET('/api/projects')),
  })
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: keys.project(projectId),
    queryFn: () => unwrap(api.GET('/api/projects/{project_id}', path(projectId))),
    retry: false,
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Schemas['ProjectCreate'] = {}) =>
      unwrap(api.POST('/api/projects', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projects, exact: true }),
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Schemas['ProjectUpdate']) =>
      unwrap(api.PATCH('/api/projects/{project_id}', { ...path(id), body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.projects, exact: true }),
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE('/api/projects/{project_id}', path(id))),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: keys.project(id) })
      return qc.invalidateQueries({ queryKey: keys.projects, exact: true })
    },
  })
}

/** 연결/LLM 상태가 바뀌면 사이드바의 상태 표시도 다시 불러온다. */
function invalidateProjectStatus(qc: ReturnType<typeof useQueryClient>, projectId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: keys.projects, exact: true }),
    qc.invalidateQueries({ queryKey: keys.project(projectId), exact: true }),
  ])
}

// ── DB 연결 ───────────────────────────────────────────────────────────────
export function useConnection(projectId: string) {
  return useQuery({
    queryKey: keys.connection(projectId),
    queryFn: () => unwrap(api.GET('/api/projects/{project_id}/connection', path(projectId))),
  })
}

export function useSaveConnection(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ConnectionInput) =>
      unwrap(api.PUT('/api/projects/{project_id}/connection', { ...path(projectId), body })),
    onSuccess: (data) => {
      qc.setQueryData(keys.connection(projectId), data)
      qc.removeQueries({ queryKey: keys.schema(projectId) })
      return invalidateProjectStatus(qc, projectId)
    },
  })
}

export function useTestConnection(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      unwrap(api.POST('/api/projects/{project_id}/connection/test', path(projectId))),
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.connection(projectId), exact: true }),
        invalidateProjectStatus(qc, projectId),
      ]),
  })
}

export function useSchema(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.schema(projectId),
    queryFn: () =>
      unwrap(api.GET('/api/projects/{project_id}/connection/schema', path(projectId))),
    enabled,
  })
}

export function useRefreshSchema(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      unwrap(api.POST('/api/projects/{project_id}/connection/schema/refresh', path(projectId))),
    onSuccess: (data) => qc.setQueryData(keys.schema(projectId), data),
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.connection(projectId), exact: true }),
        invalidateProjectStatus(qc, projectId),
      ]),
  })
}

// ── LLM (BYOK) ────────────────────────────────────────────────────────────
export function useProviders() {
  return useQuery({
    queryKey: keys.providers,
    queryFn: () => unwrap(api.GET('/api/llm/providers')),
    staleTime: Infinity,
  })
}

export function useLLM(projectId: string) {
  return useQuery({
    queryKey: keys.llm(projectId),
    queryFn: () => unwrap(api.GET('/api/projects/{project_id}/llm', path(projectId))),
  })
}

export function useSaveLLM(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: LLMConfigInput) =>
      unwrap(api.PUT('/api/projects/{project_id}/llm', { ...path(projectId), body })),
    onSuccess: (data) => {
      qc.setQueryData(keys.llm(projectId), data)
      return invalidateProjectStatus(qc, projectId)
    },
  })
}

export function useTestLLM(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/projects/{project_id}/llm/test', path(projectId))),
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.llm(projectId) }),
        invalidateProjectStatus(qc, projectId),
      ]),
  })
}
