from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health
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
    api.include_router(health.router)
    app.include_router(api)
    return app


app = create_app()
