import { redisClient } from "./redisClient";
import { REDIS_KEYS } from "./keys";

export async function enqueueJob(
  jobId: string
) {
  await redisClient.lpush(
    REDIS_KEYS.MAIN_QUEUE,
    jobId
  );
}