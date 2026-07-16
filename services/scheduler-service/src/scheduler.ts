import "dotenv/config";
import { PrismaClient } from "@prisma/client";

import { RetryService } from "./services/retry.service";
import { monitorWorkers } from "./worker-monitor";
import { LeaderService, SCHEDULER_ID } from "./leader-election/leader.service";
import { startMetricsServer } from "./metrics/server";
import { queueDepthGauge } from "./metrics/metrics";
import { redisClient, redisBlockingClient } from "./redis/redisClient";
import { REDIS_KEYS } from "./redis/keys";

const retryService = new RetryService();
const leaderService = new LeaderService();

const POLL_INTERVAL = 5000;
const prisma = new PrismaClient();

let shuttingDown = false;
let shutdownStarted = false;
let schedulerPromise: Promise<void> | null = null;

async function runScheduler() {
  startMetricsServer();
  console.log(`Scheduler started with ID: ${SCHEDULER_ID}`);

  while (!shuttingDown) {
    try {
      const isLeader = await leaderService.isLeader();

      if (!isLeader) {
        const acquired = await leaderService.acquireLeadership();
        if (!acquired) {
          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
          continue;
        }
      }

      const renewed = await leaderService.renewLeadership();
      if (!renewed) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        continue;
      }

      const depth = await redisClient.llen(REDIS_KEYS.MAIN_QUEUE);
      queueDepthGauge.set(depth);

      await monitorWorkers();
      
      await retryService.processRetries();
    } catch (error) {
      console.error(error);
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
}

async function shutdown() {
  if (shutdownStarted) return;
  shutdownStarted = true;

  console.log("Shutting down scheduler...");
  shuttingDown = true;

  try {
    if (schedulerPromise) {
      console.log("Waiting for current scheduler loop to finish...");
      await schedulerPromise;
    }

    await leaderService.releaseLeadership();
    
    await redisClient.quit();
    await redisBlockingClient.quit();
    await prisma.$disconnect();

    console.log("Scheduler shutdown complete");
  } catch (error) {
    console.error("Error during scheduler shutdown:", error);
    process.exitCode = 1;
  }
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

schedulerPromise = runScheduler().catch((err) => {
  console.error("Scheduler failed", err);
  process.exitCode = 1;
});