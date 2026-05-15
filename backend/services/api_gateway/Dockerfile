FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir uv
ENV PYTHONPATH=/app/backend/services/api_gateway:/app/backend/shared
WORKDIR /app/backend/services/api_gateway
# Keep the build context aligned with the service path so the shared dependency
# can be resolved via the relative `../../shared` source in pyproject.toml.
COPY backend/shared /app/backend/shared
COPY backend/services/api_gateway/pyproject.toml ./
RUN uv pip install --system --no-cache .
COPY backend/services/api_gateway/app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
