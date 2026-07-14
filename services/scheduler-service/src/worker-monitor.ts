import { WorkerMonitorService } from "./services/worker-monitor.service";
import { RecoveryService } from "./services/recovery.service";
import { deadWorkersCounter, activeWorkersGauge } from "./metrics/metrics";
const workerMonitor = new WorkerMonitorService();

const recoveryService = new RecoveryService();

// Track consecutive missed heartbeats per worker.
// A worker must miss MISS_THRESHOLD checks in a row before being declared DEAD.
const MISS_THRESHOLD = 3;
const missedHeartbeats = new Map<string, number>();

export async function monitorWorkers() {
  try {
    const workers = await workerMonitor.getActiveWorkers();
    
    activeWorkersGauge.set(workers.length);

    for (const workerId of workers) {
      const alive = await workerMonitor.isWorkerAlive(workerId);

      if (alive) {
        // Reset strike counter whenever the worker is healthy
        missedHeartbeats.set(workerId, 0);
        continue;
      }

      const misses = (missedHeartbeats.get(workerId) ?? 0) + 1;
      missedHeartbeats.set(workerId, misses);

      console.log(
        `[MONITOR] ${workerId} missed heartbeat (${misses}/${MISS_THRESHOLD})`,
      );

      if (misses >= MISS_THRESHOLD) {
        console.log(`Worker ${workerId} marked DEAD after ${misses} missed heartbeats`);
        deadWorkersCounter.inc();
        missedHeartbeats.delete(workerId);

        const recovered = await recoveryService.recoverWorkerJobs(workerId);
        console.log(`Recovered ${recovered} jobs from ${workerId}`);

        await workerMonitor.removeWorker(workerId);
      }
    }
  } catch (error) {
    console.error("Worker monitor failed:", error);
  }
}
