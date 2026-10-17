import { PrismaClient } from "@prisma/client";
import { QueueService } from "./queue.service";
import { EventService } from "./event.service";

const prisma = new PrismaClient();

export class RetryService {
  private queueService = new QueueService();
  private eventService = new EventService();

  async processRetries(): Promise<number> {
    const jobs = await this.getRetryingJobs();

    let requeuedCount = 0;
    for (const job of jobs) {
      // 1. Atomically claim and transition to QUEUED using OCC
      const updateResult = await prisma.job.updateMany({
        where: {
          id: job.id,
          status: "RETRYING",
          version: job.version,
        },
        data: {
          status: "QUEUED",
          nextRetryAt: null,
          version: {
            increment: 1,
          },
        },
      });

      if (updateResult.count === 0) {
        // Lost race to concurrent sweep or job was cancelled
        continue;
      }

      // 2. Enqueue to Redis; if it fails, rollback status to RETRYING with version check
      try {
        await this.queueService.enqueue(job.id, job.priority || "MEDIUM");
      } catch (error) {
        console.error(`Failed to enqueue retry for job ${job.id}, rolling back:`, error);
        try {
          await prisma.job.updateMany({
            where: {
              id: job.id,
              status: "QUEUED",
              workerId: null,
              version: job.version + 1,
            },
            data: {
              status: "RETRYING",
              nextRetryAt: new Date(Date.now() + 5000),
              version: { increment: 1 },
            },
          });
        } catch (rollbackError) {
          console.error(
            `Failed to rollback job ${job.id} to RETRYING after enqueue error (will be recovered by stale QUEUED reconciler):`,
            rollbackError
          );
        }
        // Continue to next job in batch rather than aborting entire scheduler sweep
        continue;
      }

      // 3. Emit requeue event
      try {
        await this.eventService.createEvent(
          job.id,
          "JOB_REQUEUED",
          { retryCount: job.retryCount },
        );
      } catch (eventErr) {
        console.error(`Failed to record JOB_REQUEUED event for ${job.id}:`, eventErr);
      }

      console.log(`Requeued ${job.id} (retry ${job.retryCount})`);
      requeuedCount++;
    }
    return requeuedCount;
  }

  async getRetryingJobs() {
    return prisma.job.findMany({
      where: {
        status: "RETRYING",
        OR: [
          {
            nextRetryAt: {
              lte: new Date(),
            },
          },
          {
            nextRetryAt: null,
          },
        ],
      },
      orderBy: {
        updatedAt: "asc",
      },
      take: 100,
    });
  }
}