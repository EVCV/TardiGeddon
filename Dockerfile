# Online game server image (see docs/ONLINE.md). The server runs the shared
# TypeScript simulation directly with tsx.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
COPY server ./server
ENV PORT=8787
EXPOSE 8787
CMD ["npx", "tsx", "server/main.ts"]
