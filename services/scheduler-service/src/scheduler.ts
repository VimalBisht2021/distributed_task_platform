import "dotenv/config";

import { RetryService } from "./services/retry.service";
import { monitorWorkers } from "./worker-monitor";
import { LeaderService, SCHEDULER_ID } from "./leader-election/leader.service";
import { startMetricsServer } from "./metrics/server";
import { queueDepthGauge } from "./metrics/metrics";
import { redisClient } from "./redis/redisClient";
import { REDIS_KEYS } from "./redis/keys";

const retryService = new RetryService();
const leaderService = new LeaderService();

const POLL_INTERVAL = 5000;

async function runScheduler() {
  startMetricsServer();
  console.log(`Scheduler started with ID: ${SCHEDULER_ID}`);

  while (true) {
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

runScheduler();