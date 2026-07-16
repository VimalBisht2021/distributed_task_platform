import { getToken, submitJob, getJobStatus, sleep, runDockerCommand } from './utils';

export default async function runBenchmarkScenario(log: (msg: string) => void) {
  log("=== Benchmark Mode ===");
  log("Purpose: How does performance scale?");

  const workerCounts = [1, 2, 4, 8];
  const jobCount = 50;

  const token = await getToken();

  log(`Running Benchmark: ${jobCount} jobs per worker count`);
  log("Workers | Jobs | Time (s) | Jobs/sec");
  log("---------------------------------------");

  for (const w of workerCounts) {
    await runDockerCommand(`compose up -d --scale worker-service=${w} --scale scheduler-service=1`);
    await sleep(5000); // Wait for workers to spin up

    const jobIds: string[] = [];
    const startTime = Date.now();

    for (let i = 0; i < jobCount; i++) {
      const jobId = await submitJob(token, "MEDIUM", "Benchmark", 10);
      jobIds.push(jobId);
    }

    const lastJob = jobIds[jobIds.length - 1];

    while (true) {
      const status = await getJobStatus(token, lastJob);
      if (status === 'COMPLETED') break;
      await sleep(500);
    }

    const endTime = Date.now();
    const elapsedSec = (endTime - startTime) / 1000;
    const jobsPerSec = (jobCount / elapsedSec).toFixed(2);

    log(`${w.toString().padEnd(7)} | ${jobCount.toString().padEnd(4)} | ${elapsedSec.toFixed(2).padEnd(8)} | ${jobsPerSec}`);
  }

  log("Benchmark complete!");
}
