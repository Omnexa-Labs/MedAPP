FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir uv setuptools wheel
ENV PYTHONPATH=/app/backend/services/social_service:/app/backend/shared
WORKDIR /app/backend/services/social_service
COPY backend/shared /app/backend/shared
COPY backend/services/social_service/pyproject.toml ./
COPY backend/services/social_service/app ./app
RUN uv pip install --system --no-build-isolation --no-cache .
EXPOSE 8011
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8011"]
