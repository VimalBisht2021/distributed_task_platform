FROM node:20-alpine
WORKDIR /app

# Install dependencies
COPY services/scheduler-service/package*.json ./services/scheduler-service/
WORKDIR /app/services/scheduler-service
RUN npm ci

# Copy Prisma schema and generate client
COPY services/scheduler-service/prisma ./prisma
RUN npx prisma generate

# Copy source code and shared code
WORKDIR /app
COPY shared ./shared
COPY services/scheduler-service ./services/scheduler-service

# Build TypeScript
WORKDIR /app/services/scheduler-service
RUN npm run build

# Start the service
CMD ["npm", "start"]
