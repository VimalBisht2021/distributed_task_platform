FROM node:20-alpine
WORKDIR /app/distributed-task-platform

# Install dependencies
COPY services/api-service/package*.json ./services/api-service/
WORKDIR /app/distributed-task-platform/services/api-service
RUN --mount=type=cache,id=npm-api,target=/root/.npm npm ci

# Copy Prisma schema and generate client
COPY services/api-service/prisma ./prisma
RUN npx prisma@6 generate

# Copy source code and shared code
WORKDIR /app/distributed-task-platform
COPY shared ./shared
COPY runtime ./runtime
COPY services/api-service ./services/api-service

# Copy execution contract to sibling directory
COPY --from=execution_contract_pkg . /app/execution-contract

# Build TypeScript
WORKDIR /app/distributed-task-platform/services/api-service
RUN npm run build

EXPOSE 3000

# Start the service
CMD ["npm", "start"]
