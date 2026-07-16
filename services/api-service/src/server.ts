import dotenv from "dotenv";
dotenv.config();
import { PrismaClient } from "@prisma/client";

import app from "./app";
import { redisClient, redisBlockingClient } from "./redis/client";
import { register } from "./metrics/metrics";

const PORT = process.env.PORT || 3000;

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

const prisma = new PrismaClient();
let shutdownStarted = false;

const server = app.listen(PORT, async () => {
  console.log(`API Service running on port ${PORT}`);

  await redisClient.connect();
  await redisBlockingClient.connect();
  console.log("Connected to Redis");
});

async function shutdown() {
  if (shutdownStarted) return;
  shutdownStarted = true;

  console.log("Shutting down API service...");

  try {
    // Close the server to stop accepting new connections
    server.close(async () => {
      console.log("HTTP server closed.");
      
      // Close all existing keep-alive connections
      server.closeAllConnections?.();
      
      await redisClient.quit();
      await redisBlockingClient.quit();
      await prisma.$disconnect();

      console.log("API service shutdown complete");
    });
  } catch (error) {
    console.error("Error during API shutdown:", error);
    process.exitCode = 1;
  }
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

