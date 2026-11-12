# auto-viz frontend

React + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui + TanStack Query + React Router.

## 실행

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173 (/api 는 localhost:8000 으로 프록시)
```

백엔드가 먼저 떠 있어야 사이드바 하단의 API 상태가 "연결됨"으로 표시된다.

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 타입 검사 + 프로덕션 빌드 |
| `npm run typecheck` | 타입 검사 |
| `npm run lint` | oxlint |
| `npm test` | vitest (scripts/vitest.mjs 경유) |
| `npm run gen:api` | 백엔드 OpenAPI → `src/api/schema.d.ts` 타입 생성 (backend/.venv 필요) |

## 구조

```
src/
  api/          API 클라이언트(openapi-fetch), 생성된 타입, 쿼리 훅
  app/          라우트, 섹션 정의
  components/
    layout/     AppLayout, Sidebar 등
    ui/         shadcn/ui 컴포넌트
  lib/          유틸 (cn)
  pages/        라우트별 화면
  test/         테스트 setup
```

## 테마

- 색상 토큰은 `src/index.css`에 있으며 목업(`mock up/auto-viz/src/styles/theme.css`)의 다크 테마를 옮겼다.
- 목업의 주황 포인트 색은 `brand`(`text-brand`, `bg-brand`)로 둔다. shadcn의 `accent`는 hover 배경 용도라 분리했다.

## 주의 사항

- **shadcn 컴포넌트 추가 시**: `npx shadcn@latest add <name>` 후 생성된 파일의 `import { cn } from "cn"`을 `"@/lib/utils"`로 고치고, 함께 설치된 `cn` 패키지를 `npm uninstall cn`으로 제거한다. TypeScript 7에서 `baseUrl`이 없어져 shadcn CLI가 경로 별칭을 해석하지 못하기 때문이다.
- **openapi-typescript**는 TypeScript 5를 요구하므로 devDependency로 넣지 않고 `gen:api`에서 `npx`로 격리 실행한다.
- **테스트**는 `npm test`로 실행한다. Windows에서 드라이브 문자가 소문자(`e:`)인 경로에서 `npx vitest`를 바로 실행하면 vitest 모듈이 중복 로드되어 실패한다.
