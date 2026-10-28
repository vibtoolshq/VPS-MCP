# STRUCTURE ONLY — intentionally not deployable yet.
# A hardened multi-stage Node.js build will be added after MCP implementation and tests.
FROM node:22-alpine
WORKDIR /app
RUN echo 'VPS-MCP is a scaffold; do not deploy yet' && exit 1
