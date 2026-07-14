import { redisBlockingClient } from "../redis/redisClient";

export async function waitForJob() {
  while (true) {
    const jobId = await redisBlockingClient.rpoplpush(
      "main-queue",
      "processing-queue",
    );

    if (jobId) {
      return jobId;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
