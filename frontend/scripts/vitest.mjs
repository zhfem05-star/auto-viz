// Windows에서 cwd의 드라이브 문자가 소문자(e:)이면 vitest 모듈이 E:/e: 두 경로로 중복 로드되어
// "failed to find the current suite" 오류가 난다. 실제 경로(realpath)로 cwd를 맞춘 뒤 실행한다.
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import path from 'node:path'

const cwd = realpathSync.native(path.resolve(import.meta.dirname, '..'))
const bin = path.join(cwd, 'node_modules/vitest/vitest.mjs')
const res = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { cwd, stdio: 'inherit' })
process.exit(res.status ?? 1)
