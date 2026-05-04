FROM node:22-alpine AS frontend-builder

WORKDIR /frontend
COPY web/frontend/package.json web/frontend/package-lock.json web/frontend/tsconfig.json web/frontend/vite.config.ts web/frontend/index.html ./
COPY web/frontend/src ./src
RUN npm ci && npm run build

FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update
RUN apt-get install -y --no-install-recommends git

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /build
COPY pyproject.toml README.md ./
COPY web ./web
RUN pip install --no-cache-dir .

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

COPY --from=builder /opt/venv /opt/venv

RUN useradd --create-home appuser
USER appuser
WORKDIR /home/appuser/app

COPY --from=builder --chown=appuser:appuser /build .
COPY --from=frontend-builder --chown=appuser:appuser /frontend/dist ./web/frontend/dist

CMD ["uvicorn", "web.backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
