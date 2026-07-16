import { WorkerService } from "./services/worker.service";

const workerService = new WorkerService();

let heartbeatInterval: NodeJS.Timeout | null = null;

export function startHeartbeat(
  workerId: string,
  capacity: number = 1
) {
  heartbeatInterval = setInterval(async () => {
    try {
      await workerService.heartbeat(workerId, capacity);
    } catch (error) {
      console.error(
        "Heartbeat failed:",
        error,
      );
    }
  }, 5000);
}

export function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}