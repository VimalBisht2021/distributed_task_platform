import { getToken, submitJob, getJobStatus, sleep } from './utils';

export default async function runBenchmarkScenario(log: (msg: string) => void) {
  log("=== Benchmark Mode ===");
  log("Purpose: How fast can the system process jobs?");

  const token = await getToken();

  const batchSizes = [10, 25, 50];

  log("Batch  | Jobs | Time (s) | Jobs/sec");
  log("---------------------------------------");

  for (const batchSize of batchSizes) {
    const jobIds: string[] = [];
    const startTime = Date.now();

    // Submit all jobs in rapid succession
    for (let i = 0; i < batchSize; i++) {
      const jobId = await submitJob(token, "MEDIUM", `Bench-${batchSize}-${i}`, 10);
      jobIds.push(jobId);
    }

    const submitTime = ((Date.now() - startTime) / 1000).toFixed(2);
    log(`Submitted ${batchSize} jobs in ${submitTime}s. Waiting for completion...`);

    // Wait for all jobs to complete
    const deadline = Date.now() + 120_000; // 2 min timeout
    let allDone = false;

    while (!allDone && Date.now() < deadline) {
      allDone = true;
      for (const jobId of jobIds) {
        const status = await getJobStatus(token, jobId);
        if (status !== 'COMPLETED' && status !== 'FAILED') {
          allDone = false;
          break;
        }
      }
      if (!allDone) await sleep(500);
    }

    const endTime = Date.now();
    const elapsedSec = (endTime - startTime) / 1000;
    const jobsPerSec = (batchSize / elapsedSec).toFixed(2);

    log(`${batchSize.toString().padEnd(6)} | ${batchSize.toString().padEnd(4)} | ${elapsedSec.toFixed(2).padEnd(8)} | ${jobsPerSec}`);
  }

  log("");
  log("Benchmark complete!");
}
