import { Sparkles } from 'lucide-react'

export function HomePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <Sparkles className="size-6 text-brand" />
      <h1 className="text-lg font-semibold">auto-viz</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        DB를 연결하고 대화로 리포트와 차트를 만들어 보세요.
        <br />
        프로젝트를 만들면 여기에서 시작할 수 있습니다.
      </p>
    </div>
  )
}
