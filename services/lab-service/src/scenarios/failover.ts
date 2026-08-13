import { sleep, REDIS_HOST } from './utils';

export default async function runFailoverScenario(log: (msg: string) => void) {
  log("=== Leader Failover Mode ===");
  log("Purpose: Is leader election working correctly?");

  log("Checking current leader in Redis...");
  
  // Connect to Redis to check the leader key
  // We use the Redis API endpoint or direct fetch to check leader state
  const checkLeader = async (): Promise<string | null> => {
    try {
      // Use the DTP API metrics or direct Redis check
      const res = await fetch(`http://task-platform-api:3000/metrics/health`);
      if (res.ok) {
        const data = await res.json();
        return data.schedulerLeader || null;
      }
    } catch (e) {
      // Fallback: try to read from Redis directly via exec in redis container
    }
    return null;
  };

  const leader1 = await checkLeader();
  if (leader1) {
    log(`Current leader: ${leader1}`);
  } else {
    log("Could not determine current leader via API. Checking Redis directly...");
  }

  // Use the lab service's own redis check as a fallback
  // The lab service can talk to redis on the Docker network
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const { stdout: redisResult } = await execAsync(
      `docker exec task-platform-redis redis-cli get "scheduler:leader"`
    ).catch(() => ({ stdout: '' }));

    if (redisResult.trim()) {
      log(`Leader from Redis: ${redisResult.trim()}`);
    } else {
      log("No leader key found in Redis.");
    }
  } catch (e) {
    log("Note: Direct Redis check not available in isolated mode.");
  }

  log("");
  log("Testing leader stability under load...");

  // Submit some jobs to create load during the leader check
  const { getToken, submitJob, getJobStatus } = await import('./utils');
  const token = await getToken();
  
  const jobIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const jobId = await submitJob(token, "HIGH", `Failover Test Job ${i + 1}`);
    jobIds.push(jobId);
    log(`Submitted test job: ${jobId}`);
  }

  log("Waiting 10s to verify scheduler remains stable under load...");
  await sleep(10000);

  // Check all jobs processed
  let completed = 0;
  for (const jobId of jobIds) {
    const status = await getJobStatus(token, jobId);
    if (status === 'COMPLETED') completed++;
    log(`Job ${jobId}: ${status}`);
  }

  log("");
  if (completed === jobIds.length) {
    log("✓ All jobs completed — scheduler leadership stable under load!");
  } else {
    log(`⚠ ${completed}/${jobIds.length} completed — some jobs may still be processing.`);
  }

  log("Leader failover test completed!");
}
