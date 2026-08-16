FROM node:20-bullseye-slim AS builder

WORKDIR /app

COPY services/lab-service/package*.json ./services/lab-service/

WORKDIR /app/services/lab-service
RUN --mount=type=cache,id=npm-lab,target=/root/.npm npm ci

# Copy only the lab-service source (it has no monorepo-external imports)
WORKDIR /app
COPY services/lab-service ./services/lab-service

# Build lab-service
WORKDIR /app/services/lab-service
RUN npm run build

FROM node:20-bullseye-slim AS runner
WORKDIR /app

# Install Docker CLI and Docker Compose Plugin
RUN apt-get update && \
    apt-get install -y ca-certificates curl gnupg && \
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
    chmod a+r /etc/apt/keyrings/docker.gpg && \
    echo \
      "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
      "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null && \
    apt-get update && \
    apt-get install -y docker-ce-cli docker-compose-plugin && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app/services/lab-service

COPY --from=builder /app/services/lab-service/node_modules ./node_modules
COPY --from=builder /app/services/lab-service/package.json ./
COPY --from=builder /app/services/lab-service/dist ./dist

ENV PORT=3006
EXPOSE 3006

CMD ["node", "dist/index.js"]
