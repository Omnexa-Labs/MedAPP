from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from .config import settings

mgmt_engine = create_async_engine(settings.mgmt_database_url, pool_pre_ping=True)
MgmtSessionLocal = async_sessionmaker(mgmt_engine, expire_on_commit=False)
