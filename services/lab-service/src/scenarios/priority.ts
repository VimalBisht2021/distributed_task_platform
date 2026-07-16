import { getToken, submitJob, waitForJob, sleep, runDockerCommand } from './utils';

export default async function runPriorityScenario(log: (msg: string) => void) {
  log("=== Priority Queue Mode ===");
  log("Purpose: Does scheduling respect priority?");

  log("Workers scaled to 0 to build queue.");
  await runDockerCommand('compose up -d --scale worker-service=0');
  
  await sleep(3000);

  const token = await getToken();

  log("Submitting 1 LOW priority job...");
  const j1 = await submitJob(token, "LOW", "Low Priority");

  log("Submitting 1 MEDIUM priority job...");
  const j2 = await submitJob(token, "MEDIUM", "Medium Priority");

  log("Submitting 1 HIGH priority job...");
  const j3 = await submitJob(token, "HIGH", "High Priority");

  log("Submitting 1 CRITICAL priority job...");
  const j4 = await submitJob(token, "CRITICAL", "Critical Priority");

  log("Starting 1 worker to process the queue...");
  await runDockerCommand('compose up -d --scale worker-service=1');

  await waitForJob(token, j4, (m) => log(`[CRITICAL] ${m}`));
  await waitForJob(token, j3, (m) => log(`[HIGH] ${m}`));
  await waitForJob(token, j2, (m) => log(`[MEDIUM] ${m}`));
  await waitForJob(token, j1, (m) => log(`[LOW] ${m}`));

  log("Priority queue test completed successfully!");
}
