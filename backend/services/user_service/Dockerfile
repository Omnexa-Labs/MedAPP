FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir uv setuptools wheel
ENV PYTHONPATH=/app/backend/services/user_service:/app/backend/shared

WORKDIR /app/backend/services/user_service
COPY backend/shared /app/backend/shared
COPY backend/services/user_service/pyproject.toml ./
COPY backend/services/user_service/app ./app
COPY backend/services/user_service/alembic ./alembic
COPY backend/services/user_service/alembic.ini ./
RUN uv pip install --system --no-build-isolation --no-cache .

EXPOSE 8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
