import { redisClient } from "../redis/client";
import { WorkerDto, WorkerMetricsDto } from "../../../../shared/types";

export async function getWorkerMetrics(): Promise<WorkerMetricsDto> {
  const workerIds = await redisClient.sMembers("workers:active");

  const workers: WorkerDto[] = [];

  for (const workerId of workerIds) {
    const data = await redisClient.get(`worker:${workerId}`);

    if (!data) continue;

    workers.push(JSON.parse(data));
  }

  const totalCapacity = workers.reduce(
    (sum, worker) => sum + worker.capacity,
    0,
  );

  const totalLoad = workers.reduce(
    (sum, worker) => sum + worker.currentLoad,
    0,
  );

  return {
    workers,
    activeWorkers: workers.length,
    totalCapacity,
    currentLoad: totalLoad,
    utilization:
      totalCapacity === 0
        ? 0
        : Number(((totalLoad / totalCapacity) * 100).toFixed(2)),
  };
}
