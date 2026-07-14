import { redisClient } from "./client";
import { REDIS_KEYS } from "./keys";

export async function enqueueJob(
  jobId: string
) {
  await redisClient.lPush(
    REDIS_KEYS.MAIN_QUEUE,
    jobId
  );
}