FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

RUN apk add --no-cache dumb-init \
    && mkdir -p logs uploads \
    && chown -R node:node /app

USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://localhost:5000/health/ready || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
