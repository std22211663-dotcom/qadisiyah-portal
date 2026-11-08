FROM node:22-alpine
WORKDIR /app
COPY package.json server.js org.json ./
COPY public ./public
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000 \
    DATA_DIR=/var/data \
    TRUST_PROXY=1 \
    COOKIE_SECURE=1 \
    SERVE_STATIC=0
RUN mkdir -p /var/data && chown -R node:node /var/data /app
USER node
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1
CMD ["node", "server.js"]
