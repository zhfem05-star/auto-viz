import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
      <p>페이지를 찾을 수 없습니다</p>
      <Link to="/" className="text-brand hover:underline">
        처음으로
      </Link>
    </div>
  )
}
