// 백엔드 OpenAPI 스키마를 내보내고 TypeScript 타입(src/api/schema.d.ts)을 생성한다.
// openapi-typescript는 TypeScript 5를 peer로 요구하므로 프로젝트(TS 7)와 분리해 npx로 실행한다.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const backend = path.resolve(root, '../backend')
const python = [
  path.join(backend, '.venv/Scripts/python.exe'),
  path.join(backend, '.venv/bin/python'),
].find(existsSync)

if (!python) {
  console.error('backend/.venv 가 없습니다. backend README의 설치 단계를 먼저 실행하세요.')
  process.exit(1)
}

function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npx' })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

const schema = path.join(root, 'openapi.json')
run(python, ['-m', 'app.scripts.export_openapi', schema], backend)
run(
  'npx',
  ['-y', '-p', 'typescript@5', '-p', 'openapi-typescript@7', 'openapi-typescript', 'openapi.json', '-o', 'src/api/schema.d.ts'],
  root,
)
