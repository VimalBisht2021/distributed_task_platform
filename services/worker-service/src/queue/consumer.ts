import { redisBlockingClient } from "../redis/redisClient";
import { PRIORITY_QUEUES, REDIS_KEYS } from "../../../../shared/constants/redis";

export async function waitForJob(isShuttingDown: () => boolean) {
  while (!isShuttingDown()) {
    // Check priority queues in order: CRITICAL → HIGH → MEDIUM → LOW
    for (const queue of PRIORITY_QUEUES) {
      const jobId = await redisBlockingClient.rpoplpush(
        queue,
        "processing-queue",
      );
      if (jobId) {
        return jobId;
      }
    }

    // Backward compatibility: also check the old main-queue
    const fallbackJobId = await redisBlockingClient.rpoplpush(
      "main-queue",
      "processing-queue",
    );
    if (fallbackJobId) {
      return fallbackJobId;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}
