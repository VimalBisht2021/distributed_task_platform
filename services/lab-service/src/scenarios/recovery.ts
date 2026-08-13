import { getToken, submitJob, waitForJob, sleep, getJobStatus } from './utils';

export default async function runRecoveryScenario(log: (msg: string) => void) {
  log("=== Worker Recovery Mode ===");
  log("Purpose: Can the system handle job failures gracefully?");

  const token = await getToken();

  log("Submitting a batch of 5 HIGH priority jobs...");
  const jobIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const jobId = await submitJob(token, "HIGH", `Recovery Test Job ${i + 1}`);
    jobIds.push(jobId);
    log(`Submitted job ${i + 1}: ${jobId}`);
  }

  log("Waiting for jobs to be processed...");
  await sleep(3000);

  // Check status of all jobs
  let completed = 0;
  let failed = 0;
  let running = 0;
  let pending = 0;

  for (const jobId of jobIds) {
    const status = await getJobStatus(token, jobId);
    if (status === 'COMPLETED') completed++;
    else if (status === 'FAILED') failed++;
    else if (status === 'RUNNING') running++;
    else pending++;
  }

  log(`Status after 3s: ${completed} completed, ${running} running, ${pending} pending, ${failed} failed`);

  log("Waiting for all remaining jobs to complete (up to 60s)...");
  
  let allDone = false;
  const deadline = Date.now() + 60_000;

  while (!allDone && Date.now() < deadline) {
    allDone = true;
    completed = 0;
    failed = 0;
    
    for (const jobId of jobIds) {
      const status = await getJobStatus(token, jobId);
      if (status === 'COMPLETED') {
        completed++;
      } else if (status === 'FAILED') {
        failed++;
      } else {
        allDone = false;
      }
    }
    
    if (!allDone) await sleep(1000);
  }

  log("");
  log(`Final Results: ${completed} completed, ${failed} failed out of ${jobIds.length} jobs`);

  if (completed === jobIds.length) {
    log("✓ All jobs recovered and completed successfully!");
  } else if (completed > 0) {
    log(`⚠ ${completed}/${jobIds.length} jobs completed. System showed partial recovery.`);
  } else {
    throw new Error("No jobs completed — system may not be processing jobs.");
  }

  log("Worker recovery test completed!");
}
