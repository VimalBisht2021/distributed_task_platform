FROM node:20-alpine
WORKDIR /app

# Install native build tools required for isolated-vm (node-gyp compilation)
RUN apk add --no-cache python3 make g++

# Install dependencies
COPY services/worker-service/package*.json ./services/worker-service/
WORKDIR /app/services/worker-service
RUN --mount=type=cache,id=npm-worker,target=/root/.npm npm ci

# Copy Prisma schema and generate client
COPY services/worker-service/prisma ./prisma
RUN npx prisma@6 generate

# Copy source code and shared code
WORKDIR /app
COPY shared ./shared
COPY services/worker-service ./services/worker-service

# Build TypeScript
WORKDIR /app/services/worker-service
RUN npm run build

# Start the service
CMD ["npm", "start"]
