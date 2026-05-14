from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


def create_engine_and_sessionmaker(dsn: str, *, echo: bool = False):
    engine = create_async_engine(dsn, echo=echo, pool_pre_ping=True, pool_size=10)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
    return engine, sessionmaker


@asynccontextmanager
async def get_session(sessionmaker: async_sessionmaker) -> AsyncIterator[AsyncSession]:
    async with sessionmaker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
