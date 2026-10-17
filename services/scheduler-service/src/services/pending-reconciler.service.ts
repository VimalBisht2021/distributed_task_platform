import { PrismaClient } from "@prisma/client";
import { QueueService } from "./queue.service";
import { EventService } from "./event.service";
import { redisClient } from "../redis/redisClient";
import { REDIS_KEYS } from "../redis/keys";

const prisma = new PrismaClient();

// Default grace period (10 seconds) prevents racing with active API requests creating jobs
const DEFAULT_PENDING_GRACE_PERIOD_MS = 10000;

export class PendingReconcilerService {
  private queueService = new QueueService();
  private eventService = new EventService();

  constructor(
    private readonly gracePeriodMs: number = DEFAULT_PENDING_GRACE_PERIOD_MS
  ) {}

  async processPendingJobs(): Promise<number> {
    const pendingJobs = await this.getUndispatchedPendingJobs();

    let reconciledCount = 0;
    for (const job of pendingJobs) {
      try {
        await this.queueService.enqueue(job.id, job.priority || "MEDIUM");

        const updateResult = await prisma.job.updateMany({
          where: {
            id: job.id,
            status: "PENDING",
            version: job.version,
          },
          data: {
            status: "QUEUED",
            version: {
              increment: 1,
            },
          },
        });

        if (updateResult.count > 0) {
          await this.eventService.createEvent(
            job.id,
            "JOB_QUEUED",
            { reason: "RECONCILED_FROM_PENDING" }
          );
          console.log(`Reconciled and enqueued pending job ${job.id}`);
          reconciledCount++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error(`Failed to reconcile pending job ${job.id}: ${message}`);
      }
    }

    return reconciledCount;
  }

  async isJobInAnyQueue(jobId: string): Promise<boolean> {
    const allQueues = [
      REDIS_KEYS.QUEUE_CRITICAL,
      REDIS_KEYS.QUEUE_HIGH,
      REDIS_KEYS.QUEUE_MEDIUM,
      REDIS_KEYS.QUEUE_LOW,
      REDIS_KEYS.MAIN_QUEUE,
      REDIS_KEYS.PROCESSING_QUEUE,
    ];

    for (const queue of allQueues) {
      try {
        const pos = await redisClient.lpos(queue, jobId);
        if (pos !== null) {
          return true;
        }
      } catch {
        const items = await redisClient.lrange(queue, 0, -1);
        if (items.includes(jobId)) {
          return true;
        }
      }
    }
    return false;
  }

  async processStaleQueuedJobs(staleThresholdMs: number = this.gracePeriodMs): Promise<number> {
    const cutoffDate = new Date(Date.now() - staleThresholdMs);

    const candidateJobs = await prisma.job.findMany({
      where: {
        status: "QUEUED",
        workerId: null,
        updatedAt: {
          lte: cutoffDate,
        },
      },
      orderBy: {
        updatedAt: "asc",
      },
      take: 100,
    });

    let recoveredCount = 0;

    for (const job of candidateJobs) {
      try {
        // If job is already present in any Redis queue or processing-queue, skip
        const inQueue = await this.isJobInAnyQueue(job.id);
        if (inQueue) {
          continue;
        }

        // Atomically claim the stale QUEUED job and increment version
        const claimResult = await prisma.job.updateMany({
          where: {
            id: job.id,
            status: "QUEUED",
            workerId: null,
            version: job.version,
          },
          data: {
            version: { increment: 1 },
            updatedAt: new Date(),
          },
        });

        if (claimResult.count === 0) {
          continue;
        }

        // Dispatch to appropriate priority queue in Redis
        await this.queueService.enqueue(job.id, job.priority || "MEDIUM");

        await this.eventService.createEvent(
          job.id,
          "JOB_QUEUED",
          { reason: "RECONCILED_STALE_QUEUED_MISSING_FROM_REDIS" }
        );

        console.log(`Reconciled and enqueued stale QUEUED job ${job.id}`);
        recoveredCount++;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error(`Failed to reconcile stale QUEUED job ${job.id}: ${message}`);
      }
    }

    return recoveredCount;
  }

  async reconcile(): Promise<{ pending: number; staleQueued: number }> {
    const pending = await this.processPendingJobs();
    const staleQueued = await this.processStaleQueuedJobs();
    return { pending, staleQueued };
  }

  async getUndispatchedPendingJobs() {
    const cutoffDate = new Date(Date.now() - this.gracePeriodMs);

    return prisma.job.findMany({
      where: {
        status: "PENDING",
        createdAt: {
          lte: cutoffDate,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 100,
    });
  }
}
