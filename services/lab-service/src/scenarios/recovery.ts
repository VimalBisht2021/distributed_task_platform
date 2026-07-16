import { getToken, submitJob, waitForJob, sleep, runDockerCommand } from './utils';

export default async function runRecoveryScenario(log: (msg: string) => void) {
  log("=== Worker Recovery Mode ===");
  log("Purpose: Can the cluster survive worker failures?");

  log("Starting cluster with 1 worker and 1 scheduler...");
  await runDockerCommand('compose up -d --scale worker-service=1 --scale scheduler-service=1');

  // Let services stabilize
  await sleep(3000);

  const token = await getToken();

  log("Submitting a long-running job...");
  const jobId = await submitJob(token, "HIGH", "Long Job");

  log("Waiting 5 seconds for worker to pick it up...");
  await sleep(5000);

  log("Killing the worker container to simulate a crash...");
  await runDockerCommand('stop distributed-task-platform-worker-service-1');

  log("Worker killed. Waiting for heartbeat timeout and scheduler recovery (10-15s)...");
  await sleep(15000);

  log("Starting a new worker...");
  await runDockerCommand('start distributed-task-platform-worker-service-1');

  log("Waiting for the new worker to finish the job...");
  await waitForJob(token, jobId, log);

  log("Worker recovery test completed successfully!");
}
