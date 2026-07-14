import { redisClient } from "../redis/redisClient";

export class WorkerMonitorService {
  async getActiveWorkers(): Promise<string[]> {
    return redisClient.smembers("workers:active");
  }

  async isWorkerAlive(workerId: string): Promise<boolean> {
    const worker = await redisClient.get(
      `worker:${workerId}`,
    );

    if (!worker) {
      console.log(
        `[MONITOR] ${workerId} is missing`,
      );
    }

    return worker !== null;
  }

  async removeWorker(workerId: string) {
    await redisClient.srem(
      "workers:active",
      workerId,
    );
  }
}