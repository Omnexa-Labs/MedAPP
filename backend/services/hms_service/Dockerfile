FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir uv setuptools wheel
ENV PYTHONPATH=/app/backend/services/hms_service:/app/backend/shared

WORKDIR /app/backend/services/hms_service
COPY backend/shared /app/backend/shared
COPY backend/services/hms_service/pyproject.toml ./
COPY backend/services/hms_service/app ./app
COPY backend/services/hms_service/alembic ./alembic
COPY backend/services/hms_service/alembic.ini ./alembic.ini
COPY backend/services/hms_service/alembic_mgmt ./alembic_mgmt
COPY backend/services/hms_service/alembic_mgmt.ini ./alembic_mgmt.ini
RUN uv pip install --system --no-build-isolation --no-cache .

EXPOSE 8020
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8020"]
