import { PrismaClient } from "@prisma/client";
import { waitForJob } from "./queue/consumer";
import { processJob } from "./processors/job.processor";
import { EventService } from "./services/event.service";
import { ResultService } from "./services/result.service";
import { WorkerService } from "./services/worker.service";
import { startHeartbeat, stopHeartbeat } from "./heartbeat";
import crypto from "crypto";
import { redisClient, redisQueueClient } from "./redis/redisClient";
import { REDIS_KEYS } from "./redis/keys";
import { getRetryDelay } from "./utils/retry";
import {
  jobsCompletedCounter,
  jobsFailedCounter,
  jobsRetriedCounter,
  jobProcessingDuration,
  queueWaitDuration,
} from "./metrics/metrics";
import { startMetricsServer, stopMetricsServer } from "./metrics/server";

const prisma = new PrismaClient();

const eventService = new EventService();
const resultService = new ResultService();
const workerService = new WorkerService();

const WORKER_ID = process.env.WORKER_ID ?? `worker-${crypto.randomUUID()}`;
const MAX_RETRIES = 4;

export let shuttingDown = false;
let shutdownStarted = false;
const currentJobPromises: Set<Promise<boolean>> = new Set();
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "1", 10);

export async function processOneJob(workerId: string) {
  const jobId = await waitForJob(() => shuttingDown);

  if (!jobId) {
    return false;
  }

  const job = await prisma.job.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    console.error(`Job ${jobId} not found`);
    return false;
  }

  const queueWaitSeconds = (Date.now() - job.createdAt.getTime()) / 1000;

  console.log(`[${workerId}] ${new Date().toISOString()} Processing ${jobId}`);

  let currentVersion = job.version;
  let endTimer: (() => number) | undefined;

  try {
    const updateResult = await prisma.job.updateMany({
      where: { id: jobId, version: currentVersion },
      data: {
        status: "RUNNING",
        workerId: workerId,
        progress: 0,
        version: {
          increment: 1,
        },
      },
    });

    if (updateResult.count === 0) {
      console.log(`[${workerId}] Zombie worker detected on START for ${jobId}`);
      return false;
    }

    queueWaitDuration.observe(queueWaitSeconds);
    currentVersion++;

    await workerService.incrementLoad(workerId);
    await eventService.createEvent(jobId, "JOB_STARTED", workerId);

    endTimer = jobProcessingDuration.startTimer();

    // The processor will be mocked in tests
    const result = await processJob(jobId, job.jobType, job.payload);

    await resultService.createResult(
      jobId,
      result.resultType,
      `/results/${jobId}.json`,
      JSON.stringify(result).length,
      result.payload
    );

    const compResult = await prisma.job.updateMany({
      where: { id: jobId, version: currentVersion, workerId: workerId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        failureReason: null,
        progress: 100,
        workerId: null,
        version: {
          increment: 1,
        },
      },
    });

    if (compResult.count === 0) {
      console.log(
        `[${workerId}] Zombie worker detected on COMPLETE for ${jobId}`,
      );
      await workerService.decrementLoad(workerId);
      return false;
    }

    currentVersion++;

    await redisClient.lrem(REDIS_KEYS.PROCESSING_QUEUE, 1, jobId);
    await workerService.decrementLoad(workerId);

    jobsCompletedCounter.inc();
    endTimer();

    await eventService.createEvent(jobId, "JOB_COMPLETED", workerId);

    console.log(`[${workerId}] ${new Date().toISOString()} Completed ${jobId}`);

    return true;
  } catch (error) {
    endTimer?.();
    const message = error instanceof Error ? error.message : "Unknown error";

    console.error(`Failed ${jobId}: ${message}`);

    const freshJob = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!freshJob) {
      console.error(`Job ${jobId} not found during failure handling`);
      await workerService.decrementLoad(workerId);
      return false;
    }

    currentVersion = freshJob.version;

    if (freshJob.retryCount < MAX_RETRIES) {
      const nextRetryCount = freshJob.retryCount + 1;
      const baseDelaySeconds = getRetryDelay(nextRetryCount);
      // Equal jitter: Keep 50% of base delay, randomize the rest
      const delaySeconds = baseDelaySeconds * (0.5 + Math.random() * 0.5);
      const nextRetryAt = new Date(Date.now() + delaySeconds * 1000);

      const retryResult = await prisma.job.updateMany({
        where: { id: jobId, version: currentVersion, workerId: workerId },
        data: {
          status: "RETRYING",
          retryCount: {
            increment: 1,
          },
          nextRetryAt,
          failureReason: message,
          workerId: null,
          version: {
            increment: 1,
          },
        },
      });

      if (retryResult.count === 0) {
        console.log(
          `[${workerId}] Zombie worker detected on RETRY for ${jobId}`,
        );
        await workerService.decrementLoad(workerId);
        return false;
      }

      currentVersion++;
      jobsRetriedCounter.inc();

      await redisClient.lrem(REDIS_KEYS.PROCESSING_QUEUE, 1, jobId);
      await workerService.decrementLoad(workerId);

      await eventService.createEvent(jobId, "JOB_RETRY_SCHEDULED", workerId, {
        retryCount: nextRetryCount,
        reason: message,
      });

      console.log(
        `Retry ${nextRetryCount}/${MAX_RETRIES} scheduled for ${jobId}`,
      );
    } else {
      const failResult = await prisma.job.updateMany({
        where: { id: jobId, version: currentVersion, workerId: workerId },
        data: {
          status: "FAILED",
          failureReason: message,
          workerId: null,
          version: {
            increment: 1,
          },
        },
      });

      if (failResult.count === 0) {
        console.log(
          `[${workerId}] Zombie worker detected on FAIL for ${jobId}`,
        );
        await workerService.decrementLoad(workerId);
        return false;
      }

      currentVersion++;
      jobsFailedCounter.inc();
      await workerService.decrementLoad(workerId);
      await redisClient.lrem(REDIS_KEYS.PROCESSING_QUEUE, 1, jobId);

      await eventService.createEvent(jobId, "JOB_DLQ", workerId, {
        retries: freshJob.retryCount,
        reason: message,
      });

      await eventService.createEvent(jobId, "JOB_FAILED", workerId, {
        retries: freshJob.retryCount,
        reason: message,
      });

      console.log(
        `Job ${jobId} moved to DLQ after ${freshJob.retryCount} retries`,
      );
    }

    return false;
  }
}

async function runWorkerLoop() {
  while (!shuttingDown) {
    const p = processOneJob(WORKER_ID);
    currentJobPromises.add(p);
    try {
      await p;
    } catch (err) {
      console.error("Error in job loop:", err);
    } finally {
      currentJobPromises.delete(p);
    }
  }
}

async function start() {
  startMetricsServer();

  await workerService.registerWorker(WORKER_ID, CONCURRENCY);

  startHeartbeat(WORKER_ID, CONCURRENCY);

  console.log(`Worker started with concurrency ${CONCURRENCY}`);

  for (let i = 0; i < CONCURRENCY; i++) {
    runWorkerLoop();
  }
}

export async function shutdown() {
  if (shutdownStarted) return;
  shutdownStarted = true;

  console.log("Shutting down worker...");
  shuttingDown = true;

  try {
    if (currentJobPromises.size > 0) {
      console.log(
        `Waiting for ${currentJobPromises.size} current jobs to finish...`,
      );
      await Promise.all(currentJobPromises);
    }

    stopHeartbeat();
    await stopMetricsServer();
    await redisClient.del(`worker:${WORKER_ID}`);
    await redisClient.srem("workers:active", WORKER_ID);

    await redisClient.quit();
    await redisQueueClient.quit();
    await prisma.$disconnect();

    console.log("Worker shutdown complete");
  } catch (error) {
    console.error("Error during worker shutdown:", error);
    process.exitCode = 1;
  }
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

if (process.env.NODE_ENV !== "test") {
  start().catch((err) => {
    console.error("Worker failed to start", err);
    process.exitCode = 1;
  });
}
