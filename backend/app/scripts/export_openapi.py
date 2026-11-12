"""OpenAPI 스키마를 파일로 내보낸다. 프론트 타입 생성(npm run gen:api)에 사용.

사용: python -m app.scripts.export_openapi [출력 경로]
"""

import json
import sys
from pathlib import Path

from app.main import app


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("../frontend/openapi.json")
    out.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OpenAPI 스키마를 {out} 에 저장했습니다.")


if __name__ == "__main__":
    main()
