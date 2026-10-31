FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY web ./web
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=47815 \
    DB_PATH=/app/data/financeiro.db \
    TZ=America/Sao_Paulo \
    NODE_NO_WARNINGS=1
RUN apk add --no-cache tzdata
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY --from=build /app/web/dist ./web/dist
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 47815
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:47815/api/status > /dev/null || exit 1
CMD ["node", "server/index.ts"]
