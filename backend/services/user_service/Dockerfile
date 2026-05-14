FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir uv

WORKDIR /app
COPY backend/shared /shared
COPY backend/services/user_service/pyproject.toml ./
RUN uv pip install --system --no-cache .

COPY backend/services/user_service/app ./app
COPY backend/services/user_service/alembic ./alembic
COPY backend/services/user_service/alembic.ini ./

EXPOSE 8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
