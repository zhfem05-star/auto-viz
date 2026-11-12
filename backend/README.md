# auto-viz backend

FastAPI + SQLAlchemy(SQLite) + Alembic.

## 설치

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate   /   macOS·Linux: source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env   # 필요 시 수정
```

## 실행

```bash
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

- 헬스체크: http://localhost:8000/api/health
- API 문서: http://localhost:8000/docs

## 검사

```bash
pytest
ruff check .
ruff format --check .
```

## 구조

```
app/
  api/        라우터 (+ deps.py 공통 의존성)
  core/       설정(config), 암호화(crypto), 로깅
  db/         엔진·세션, 모델 베이스
  models/     SQLAlchemy 모델 (Alembic이 여기서 import)
  scripts/    export_openapi 등 유틸 스크립트
alembic/      마이그레이션
tests/
```

## 설정

환경변수(`AUTOVIZ_` 접두어) 또는 `.env`로 지정한다. 자세한 항목은 `.env.example` 참고.

- `AUTOVIZ_MASTER_KEY`를 비워두면 `data/master.key`가 자동 생성된다. 이 파일(또는 키)을 잃으면 저장된 DB 비밀번호·API 키를 복호화할 수 없으니 백업해 둔다.

## 참고

- `uvicorn[standard]` 대신 기본 `uvicorn`을 사용한다. Python 3.15용 `pyyaml` 휠이 없어 Windows에서 빌드 도구 없이 설치되지 않기 때문이다.
- `alembic.ini`는 ASCII로만 작성한다 (Windows 기본 코덱 cp949로 읽힌다).
