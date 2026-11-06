FROM node:22-alpine
WORKDIR /app
COPY package.json server.js persist.js cloud.js org.json ./
COPY public ./public
# Cloud Run: set GCS_BUCKET so the data is mirrored to Cloud Storage (see persist.js); PORT is injected by Cloud Run
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    DATA_DIR=/var/data \
    TRUST_PROXY=1 \
    COOKIE_SECURE=1 \
    SERVE_STATIC=0
RUN mkdir -p /var/data && chown -R node:node /var/data /app
USER node
CMD ["node", "cloud.js"]
