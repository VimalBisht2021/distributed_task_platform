import { redisClient } from "./client";
import { REDIS_KEYS } from "./keys";
import { getQueueForPriority } from "../../../../shared/constants/redis";

export async function enqueueJob(
  jobId: string,
  priority: string = "MEDIUM"
) {
  const queue = getQueueForPriority(priority);
  await redisClient.lPush(queue, jobId);
}