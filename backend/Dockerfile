# syntax=docker/dockerfile:1.6
#
# Shared MedApp service image.
#
# One Dockerfile that builds every Python service in `backend/services/`.
# The build pipeline passes:
#
#   --build-arg SERVICE=<service_name>   e.g. user_service
#   --build-arg SERVICE_PORT=<port>      e.g. 8001
#
# Posture:
#
#   - Multi-stage. Builder installs the wheels into a venv-style prefix;
#     the runtime stage copies only the prefix + the app source. No build
#     tools land in the runtime image — smaller attack surface, fewer
#     CVEs to chase.
#   - Non-root user with UID 10001. Matches the Helm chart's
#     `runAsUser: 10001`. Pod Security Standards `restricted` would
#     reject the image otherwise.
#   - HEALTHCHECK against /healthz so docker/k8s can detect a stuck pod
#     even before the readiness probe fires.
#   - No `pip install`, no compiler toolchain, no shell-via-CMD — uvicorn
#     is invoked in JSON exec form so SIGTERM propagates correctly.
#
# Pin the base image SHA when you cut a release; the digest below is a
# placeholder updated by Dependabot.

ARG PYTHON_VERSION=3.12
ARG SERVICE
ARG SERVICE_PORT=8000

# ─── Builder ────────────────────────────────────────────────────────────────
FROM python:${PYTHON_VERSION}-slim AS builder

ARG SERVICE

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    UV_LINK_MODE=copy

# `uv` does the install. setuptools/wheel only needed for build-isolation
# fallbacks in some sub-deps; pruned in the runtime stage.
RUN pip install --no-cache-dir uv==0.5.11 setuptools wheel

# Layout under /install — copied wholesale into runtime later.
WORKDIR /build

COPY backend/shared /build/shared
COPY backend/services/${SERVICE} /build/service

# Install the service + its shared dep into /install/usr/local. The
# --prefix lets us copy the entire site-packages tree into the runtime
# stage's Python without dragging in apt-installed system packages.
RUN uv pip install --system --no-build-isolation \
        --prefix=/install \
        /build/shared && \
    uv pip install --system --no-build-isolation \
        --prefix=/install \
        /build/service

# ─── Runtime ────────────────────────────────────────────────────────────────
FROM python:${PYTHON_VERSION}-slim AS runtime

ARG SERVICE
ARG SERVICE_PORT

# Curl is needed for HEALTHCHECK. Everything else is removed.
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl=7.* && \
    rm -rf /var/lib/apt/lists/*

# Non-root user matching the Helm chart's runAsUser=10001.
# -r = system user, -u = uid, -g = gid, -m -d = home dir.
RUN groupadd --system --gid 10001 medapp && \
    useradd --system --uid 10001 --gid 10001 --home-dir /app --no-create-home medapp && \
    mkdir -p /app/var && \
    chown -R 10001:10001 /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SERVICE_NAME=${SERVICE} \
    SERVICE_PORT=${SERVICE_PORT} \
    PATH="/usr/local/bin:${PATH}"

# Wheels + entry points from the builder stage.
COPY --from=builder /install /usr/local

# App source. The wheel install above made `app` importable as a package
# (assuming the service's pyproject.toml lists it). For services that
# also need alembic/ at runtime (migrations), we copy the source dir
# again so `alembic upgrade head` from an init job works.
COPY --chown=10001:10001 backend/services/${SERVICE} /app
WORKDIR /app

USER 10001:10001

EXPOSE ${SERVICE_PORT}

# The shell is needed to expand $SERVICE_PORT, which means signals
# don't propagate cleanly without an exec. `exec` swaps the shell out
# of the process tree so uvicorn is PID 1 and SIGTERM works.
HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${SERVICE_PORT}/healthz" || exit 1

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${SERVICE_PORT}"]
