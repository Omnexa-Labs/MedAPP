FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir uv setuptools wheel
ENV PYTHONPATH=/app/backend/services/notification_service:/app/backend/shared
WORKDIR /app/backend/services/notification_service
COPY backend/shared /app/backend/shared
COPY backend/services/notification_service/pyproject.toml ./
COPY backend/services/notification_service/alembic.ini ./
COPY backend/services/notification_service/alembic ./alembic
COPY backend/services/notification_service/app ./app
RUN uv pip install --system --no-build-isolation --no-cache .
EXPOSE 8008
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8008"]
