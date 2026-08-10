import { JobService } from '../services/job.service';
import { prisma } from '../config/prisma';
import { EventService } from '../services/event.service';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  console.log("Starting Idempotency Test...");
  const jobService = new JobService();
  const eventService = new EventService();
  
  const idempotencyKey = uuidv4();
  const userId = "test-user";
  
  const dto = {
    jobType: "HTTP",
    payload: { url: "http://example.com" },
    idempotencyKey,
    priority: "HIGH"
  };

  console.log(`Using Idempotency Key: ${idempotencyKey}`);

  // Fire 10 concurrent create requests
  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(jobService.createJob(userId, dto));
  }

  const results = await Promise.allSettled(promises);
  
  const fulfilled = results.filter(r => r.status === 'fulfilled');
  const rejected = results.filter(r => r.status === 'rejected');

  console.log(`Completed requests. Fulfilled: ${fulfilled.length}, Rejected: ${rejected.length}`);
  
  // Verify Database
  const jobs = await prisma.job.findMany({
    where: { idempotencyKey }
  });

  console.log(`Jobs created in DB: ${jobs.length}`);
  if (jobs.length !== 1) {
    throw new Error(`Expected exactly 1 job, found ${jobs.length}`);
  }

  const job = jobs[0];

  // Verify Events
  const events = await eventService.findByJobId(job.id);
  const queuedEvents = events.filter(e => e.eventType === "JOB_QUEUED");

  console.log(`JOB_QUEUED events: ${queuedEvents.length}`);
  if (queuedEvents.length !== 1) {
    throw new Error(`Expected exactly 1 JOB_QUEUED event, found ${queuedEvents.length}`);
  }

  console.log("SUCCESS: Exactly 1 job created and 1 enqueue event generated for 10 concurrent requests.");
  process.exit(0);
}

main().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
