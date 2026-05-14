FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY agents/pyproject.toml ./
RUN pip install --no-cache-dir uv && uv pip install --system --no-cache .
COPY agents/shared /app/agents/shared
COPY agents/prompts /app/agents/prompts
COPY agents/services/vitals_watcher_agent/app /app/app
ENV PYTHONPATH=/app
EXPOSE 9005
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9005"]
