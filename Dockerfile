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
# Production mode: Better Auth rate-limits sign-in attempts and insists on a real secret.
ENV NODE_ENV=production
EXPOSE 8787
# Not root: if the server were ever broken into, the attacker couldn't change the image's files.
USER node
CMD ["npx", "tsx", "server/main.ts"]
