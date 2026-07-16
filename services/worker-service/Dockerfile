FROM node:20-alpine
WORKDIR /app

# Install dependencies
COPY services/worker-service/package*.json ./services/worker-service/
WORKDIR /app/services/worker-service
RUN npm ci

# Copy Prisma schema and generate client
COPY services/worker-service/prisma ./prisma
RUN npx prisma generate

# Copy source code and shared code
WORKDIR /app
COPY shared ./shared
COPY services/worker-service ./services/worker-service

# Build TypeScript
WORKDIR /app/services/worker-service
RUN npm run build

# Start the service
CMD ["npm", "start"]
