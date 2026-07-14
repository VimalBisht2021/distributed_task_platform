import { WorkerService } from "./services/worker.service";

const workerService = new WorkerService();

export function startHeartbeat(
  workerId: string,
) {
  setInterval(async () => {
    try {
      await workerService.heartbeat(workerId);
    } catch (error) {
      console.error(
        "Heartbeat failed:",
        error,
      );
    }
  }, 5000);
}