import { redisClient } from "../redis/redisClient";
import { workerUtilizationGauge } from "../metrics/metrics";

const HEARTBEAT_TTL = 30; // 6× the 5s heartbeat interval — gives ample grace before expiry

export class WorkerService {
  async registerWorker(workerId: string, capacity: number = 1) {
    await redisClient.sadd("workers:active", workerId);

    await redisClient.set(
      `worker:${workerId}`,
      JSON.stringify({
        workerId,
        status: "ACTIVE",
        capacity: capacity,
        currentLoad: 0,
        startedAt: Date.now(),
      }),
      "EX",
      HEARTBEAT_TTL,
    );
    const saved = await redisClient.get(`worker:${workerId}`);

    console.log("Saved worker:", saved);

    workerUtilizationGauge.set({ worker_id: workerId }, 0);

    console.log(`Worker ${workerId} registered with capacity ${capacity}`);
  }

  async incrementLoad(workerId: string) {
    const worker = await redisClient.get(`worker:${workerId}`);

    if (!worker) return;

    const data = JSON.parse(worker);

    data.currentLoad += 1;

    const utilization = (data.currentLoad / data.capacity) * 100;
    workerUtilizationGauge.set({ worker_id: workerId }, utilization);

    await redisClient.set(
      `worker:${workerId}`,
      JSON.stringify(data),
      "EX",
      HEARTBEAT_TTL,
    );
  }

  async decrementLoad(workerId: string) {
    const worker = await redisClient.get(`worker:${workerId}`);

    if (!worker) return;

    const data = JSON.parse(worker);

    data.currentLoad = Math.max(0, data.currentLoad - 1);

    const utilization = (data.currentLoad / data.capacity) * 100;
    workerUtilizationGauge.set({ worker_id: workerId }, utilization);

    await redisClient.set(
      `worker:${workerId}`,
      JSON.stringify(data),
      "EX",
      HEARTBEAT_TTL,
    );
  }

  async heartbeat(workerId: string, capacity: number = 1) {
    const workerData = await redisClient.get(`worker:${workerId}`);

    if (!workerData) {
      console.log(`Heartbeat: worker key missing, re-registering`);

      await this.registerWorker(workerId, capacity);
      return;
    }

    await redisClient.set(
      `worker:${workerId}`,
      workerData,
      "EX",
      HEARTBEAT_TTL,
    );
  }
}
