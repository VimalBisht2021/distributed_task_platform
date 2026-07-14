import { redisClient } from "../redis/client";

interface WorkerInfo {
  workerId: string;
  status: string;
  capacity: number;
  currentLoad: number;
  startedAt: number;
}

interface WorkerMetrics {
  workers: WorkerInfo[];
  activeWorkers: number;
  totalCapacity: number;
  currentLoad: number;
  utilization: number;
}

export async function getWorkerMetrics(): Promise<WorkerMetrics> {
  const workerIds = await redisClient.sMembers("workers:active");

  const workers: WorkerInfo[] = [];

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
