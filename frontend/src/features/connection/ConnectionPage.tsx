import { DatabaseCard } from './DatabaseCard'
import { LLMCard } from './LLMCard'

export function ConnectionPage({ projectId }: { projectId: string }) {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4 p-6">
      <DatabaseCard projectId={projectId} />
      <LLMCard projectId={projectId} />
    </div>
  )
}
