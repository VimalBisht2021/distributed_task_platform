FROM node:20-alpine
WORKDIR /app

# Install dependencies
COPY services/api-service/package*.json ./services/api-service/
WORKDIR /app/services/api-service
RUN npm ci

# Copy Prisma schema and generate client
COPY services/api-service/prisma ./prisma
RUN npx prisma generate

# Copy source code and shared code
WORKDIR /app
COPY shared ./shared
COPY services/api-service ./services/api-service

# Build TypeScript
WORKDIR /app/services/api-service
RUN npm run build

EXPOSE 3000

# Start the service
CMD ["npm", "start"]
