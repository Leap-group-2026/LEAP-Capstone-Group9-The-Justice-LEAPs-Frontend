FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG APP_VERSION=1.0
ARG AUTH_URL
ARG SPRING_URL
RUN node scripts/write-docker-environment.mjs
RUN npm run build

FROM node:22-alpine AS production

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8083

COPY --from=build /app/dist/ribbit-app ./dist/ribbit-app
COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev

EXPOSE 8083

CMD ["node", "dist/ribbit-app/server/server.mjs"]