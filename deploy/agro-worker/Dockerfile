# Modelo para build futuro. Não executa migrations nem gera cliente Prisma.
ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /opt/hidrape-worker
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /opt/hidrape-worker
COPY --from=dependencies /opt/hidrape-worker/node_modules ./node_modules
# COPY explícito e ignore específico: duas barreiras contra inclusão acidental.
COPY package.json ./
COPY config/agro.js config/agro4.js config/cultures.js ./config/
COPY lib/agroDb.js lib/httpJson.js ./lib/
COPY services/weatherService.js services/satelliteService.js ./services/
COPY services/iot/blynk.js services/iot/notifications.js ./services/iot/
COPY services/agro4/preflight.js services/agro4/context.js services/agro4/controlPlane.js services/agro4/worker.js services/agro4/domain.js services/agro4/credentials.js services/agro4/repository.js ./services/agro4/
COPY services/agroEngine/index.js services/agroEngine/dataQuality.js services/agroEngine/anomalyDetection.js services/agroEngine/climateAnalyzer.js services/agroEngine/mlPredictor.js services/agroEngine/riskAndConfidence.js services/agroEngine/decisionMaker.js ./services/agroEngine/
COPY workers/agro.js workers/agro-start.js ./workers/
USER node
STOPSIGNAL SIGTERM
CMD ["node", "workers/agro-start.js"]
