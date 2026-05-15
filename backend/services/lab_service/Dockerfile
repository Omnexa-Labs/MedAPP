FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir uv
ENV PYTHONPATH=/app/backend/services/lab_service:/app/backend/shared
WORKDIR /app/backend/services/lab_service
COPY backend/shared /app/backend/shared
COPY backend/services/lab_service/pyproject.toml ./
RUN uv pip install --system --no-cache .
COPY backend/services/lab_service/app ./app
EXPOSE 8009
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8009"]
