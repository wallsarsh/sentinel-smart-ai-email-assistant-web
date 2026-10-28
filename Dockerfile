# Production image: one image, three commands.
#   web     node .output/server/index.mjs     (default)
#   worker  node dist/worker.mjs
#   migrate node dist/migrate.mjs             (run once per release, before the new web/worker start)
# Build: docker build -t sentinel .   Override the base for a mirror: --build-arg NODE_IMAGE=mirror.example/node:22-slim
ARG NODE_IMAGE=node:22-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
# The optional "ca" secret lets a build behind a TLS-inspecting proxy trust its CA:
#   docker build --secret id=ca,src=/path/ca.pem .      (not needed anywhere else)
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --no-audit --no-fund
COPY . .
RUN npm run build && node tools/build-worker.mjs
# Source maps are kept out of the image and published privately by the release pipeline.
RUN mkdir /maps && find .output dist -name '*.map' | tar -cf /maps/sourcemaps.tar -T - \
 && find .output dist -name '*.map' -delete

# `docker build --target sourcemaps --output type=local,dest=maps .` writes maps/sourcemaps.tar.
FROM scratch AS sourcemaps
COPY --from=build /maps/ /

FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
# Production dependencies only; `postinstall` (nuxt prepare) is a dev-time step.
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
WORKDIR /app
COPY --from=prod-deps --chown=root:root /app/node_modules ./node_modules
COPY --from=build --chown=root:root /app/.output ./.output
COPY --from=build --chown=root:root /app/dist ./dist
COPY package.json ./
# Code is root-owned and read-only to the app; the app runs as the unprivileged "node" user (uid 1000).
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
