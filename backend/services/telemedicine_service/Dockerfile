FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir uv
WORKDIR /app
COPY backend/shared /shared
COPY backend/services/telemedicine_service/pyproject.toml ./
RUN uv pip install --system --no-cache .
COPY backend/services/telemedicine_service/app ./app
EXPOSE 8007
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8007"]
