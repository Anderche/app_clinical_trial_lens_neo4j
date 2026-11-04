# One small container, no database: Node builds the Vite app, Python serves it.
# The graph JSON is baked in from web/public/data (built offline by `python -m pipeline build`).

FROM node:20-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
ARG VITE_GITHUB_URL
RUN npm run build

FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.10.0 /uv /uvx /bin/
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never
COPY pyproject.toml uv.lock ./
# Runtime deps only. The pipeline and dev groups stay on the build machine.
RUN uv sync --frozen --no-dev --no-group pipeline --no-install-project
ENV PATH="/app/.venv/bin:$PATH"
COPY server/ server/
COPY --from=web /web/dist web/dist
EXPOSE 8000
CMD ["sh", "-c", "uvicorn server.main:app --host 0.0.0.0 --port ${PORT}"]
