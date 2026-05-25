from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from .config import settings


def _resolve_url() -> str:
    return settings.dev_database_url if settings.dev_mode else settings.database_url


engine = create_async_engine(_resolve_url(), pool_pre_ping=True, future=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
