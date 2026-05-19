from shared.db import Base, create_engine_and_sessionmaker

from .config import settings


engine, SessionLocal = create_engine_and_sessionmaker(settings.database_url)