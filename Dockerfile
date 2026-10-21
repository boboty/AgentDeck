ARG NODE_BASE_IMAGE=public.ecr.aws/docker/library/node:24.13-bookworm-slim@sha256:a81a03dd965b4052269a57fac857004022b522a4bf06e7a739e25e18bce45af2
FROM ${NODE_BASE_IMAGE} AS aboard
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
 && case "$TARGETARCH" in \
      arm64) archive=aboard_0.2.3_linux_arm64.tar.gz; digest=9cac4e7763086cc1b2e1ae890bb166694854a491d91288ac1e1dab25113779ee ;; \
      amd64) archive=aboard_0.2.3_linux_amd64.tar.gz; digest=681dfee197121ebac14c220bd5844d66d2de8a06ecbee995af12413a9a18eb05 ;; \
      *) echo "Unsupported TARGETARCH=$TARGETARCH" >&2; exit 1 ;; \
    esac \
 && curl --fail --location --retry 4 "https://github.com/boboty/agent-board/releases/download/v0.2.3/${archive}" -o /tmp/aboard.tar.gz \
 && echo "${digest}  /tmp/aboard.tar.gz" | sha256sum --check - \
 && mkdir -p /tmp/aboard-extract /usr/share/doc/aboard \
 && tar --strip-components=1 -xzf /tmp/aboard.tar.gz -C /tmp/aboard-extract \
 && install -m 0755 /tmp/aboard-extract/aboard /usr/local/bin/aboard \
 && cp /tmp/aboard-extract/NOTICE /tmp/aboard-extract/LICENSE /usr/share/doc/aboard/ \
 && rm -f /tmp/aboard.tar.gz \
 && rm -rf /tmp/aboard-extract

FROM ${NODE_BASE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM ${NODE_BASE_IMAGE} AS runtime
ARG TARGETARCH
WORKDIR /app
ENV NODE_ENV=production HOME=/home/node AGENTDECK_APP_ROOT=/app AGENTDECK_DATA_DIR=/app/.agentdeck-data/runtime AGENTDECK_CONTAINER=1 HOST=0.0.0.0 PORT=4317
COPY --from=aboard /usr/local/bin/aboard /usr/local/bin/aboard
COPY --from=aboard /usr/share/doc/aboard /usr/share/doc/aboard
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist
COPY server ./server
RUN mkdir -p /app/.agentdeck-data /home/node/.agent-board /home/node/.codex \
 && chown -R node:node /app /home/node
USER node
EXPOSE 4317
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=6 CMD node -e "fetch('http://127.0.0.1:4317/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server/index.js"]
