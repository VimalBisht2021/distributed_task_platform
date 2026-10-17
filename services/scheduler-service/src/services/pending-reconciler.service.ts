import { PrismaClient } from "@prisma/client";
import { QueueService } from "./queue.service";
import { EventService } from "./event.service";

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
