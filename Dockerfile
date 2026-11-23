FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    ESSAY_BUILDER_NO_SANDBOX=1 \
    ESSAY_BUILDER_DATA=/data/state \
    ESSAY_BUILDER_ESSAYS=/data/essays \
    PATH="/opt/venv/bin:$PATH"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 python3-venv chromium \
        fonts-crosextra-caladea fonts-crosextra-carlito fonts-liberation fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/venv

WORKDIR /app
COPY engine/requirements.txt engine/
COPY engine/package.json engine/package-lock.json engine/
RUN pip install --no-cache-dir -r engine/requirements.txt \
    && npm ci --prefix engine --no-audit --no-fund

COPY engine engine
COPY studio studio
COPY ai ai
COPY docker/entrypoint.sh docker/entrypoint.sh
RUN sed -i 's/\r$//' docker/entrypoint.sh \
    && chmod +x docker/entrypoint.sh \
    && mkdir -p /data/state /data/essays /app/engine/fonts /essay

EXPOSE 8787
VOLUME ["/data", "/app/engine/fonts"]
WORKDIR /essay
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["studio"]
