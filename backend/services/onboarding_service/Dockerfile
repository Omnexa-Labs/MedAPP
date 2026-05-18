FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/backend/services/onboarding_service:/app/backend/shared
WORKDIR /app/backend/services/onboarding_service
COPY backend/shared /app/backend/shared
COPY backend/services/onboarding_service/pyproject.toml ./
COPY backend/services/onboarding_service/alembic.ini ./
COPY backend/services/onboarding_service/alembic ./alembic
COPY backend/services/onboarding_service/app ./app
RUN uv pip install --system --no-build-isolation --no-cache .
EXPOSE 8013
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8013"]