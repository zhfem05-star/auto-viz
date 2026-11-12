from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import connection, health, llm, projects
from app.core.config import APP_VERSION, get_settings
from app.core.logging import setup_logging


def create_app() -> FastAPI:
    setup_logging()
    settings = get_settings()

    app = FastAPI(title=settings.app_name, version=APP_VERSION)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    api = APIRouter(prefix="/api")
    for r in (health.router, projects.router, connection.router, llm.providers_router, llm.router):
        api.include_router(r)
    app.include_router(api)
    return app


app = create_app()
