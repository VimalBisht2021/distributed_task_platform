import { runDockerCommand, sleep } from './utils';

export default async function runFailoverScenario(log: (msg: string) => void) {
  log("=== Leader Failover Mode ===");
  log("Purpose: Does leader election actually work?");

  log("Starting cluster with 1 worker and 3 schedulers...");
  await runDockerCommand('compose up -d --scale worker-service=1 --scale scheduler-service=3');

  log("Wait for schedulers to elect a leader...");
  await sleep(5000);

  const leaderId = await runDockerCommand('exec task-platform-redis redis-cli get "scheduler:leader"');
  log(`Current Leader is: ${leaderId}`);

  if (!leaderId) {
    throw new Error('No leader found!');
  }

  log("Killing scheduler-service-1 (forcing a re-election if it was leader)");
  await runDockerCommand('stop distributed-task-platform-scheduler-service-1');

  log("Waiting for TTL expiration and new election (20s)...");
  await sleep(20000);

  const newLeaderId = await runDockerCommand('exec task-platform-redis redis-cli get "scheduler:leader"');
  log(`New Leader is: ${newLeaderId}`);

  if (leaderId !== newLeaderId && newLeaderId) {
    log("Leader successfully failed over!");
  } else if (leaderId === newLeaderId) {
    log(`Scheduler 1 was not the leader, so leader didn't change (still ${newLeaderId}).`);
    log("System remained stable.");
  } else {
    throw new Error('Failover failed! No new leader elected.');
  }

  // Bring it back up
  await runDockerCommand('start distributed-task-platform-scheduler-service-1');
  log("Leader failover test completed successfully!");
}
