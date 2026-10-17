import { PrismaClient } from "@prisma/client";
import { EventService } from "./event.service";
import { QueueService } from "./queue.service";
import { redisClient } from "../redis/redisClient";
import { REDIS_KEYS } from "../redis/keys";

const prisma = new PrismaClient();

export class RecoveryService {
  private eventService = new EventService();
  private queueService = new QueueService();

  async recoverWorkerJobs(workerId: string) {
    const jobs = await prisma.job.findMany({
      where: {
        status: "RUNNING",
        workerId,
      },
    });

    let recoveredCount = 0;

    for (const job of jobs) {
      const result = await prisma.job.updateMany({
        where: {
          id: job.id,
          version: job.version,
          workerId,
          status: "RUNNING",
        },
        data: {
          status: "RETRYING",
          workerId: null,
          nextRetryAt: new Date(),
          version: {
            increment: 1,
          },
        },
      });

      if (result.count === 0) {
        continue;
      }

      await redisClient.lrem(REDIS_KEYS.PROCESSING_QUEUE, 1, job.id);

      await this.eventService.createEvent(
        job.id,
        "JOB_RECOVERED",
        {
          workerId,
        },
      );

      console.log(
        `Recovered job ${job.id} from ${workerId}`,
      );

      recoveredCount++;
    }

    return recoveredCount;
  }

  async recoverProcessingQueue(staleThresholdMs: number = 30000) {
    const jobIds = await redisClient.lrange(REDIS_KEYS.PROCESSING_QUEUE, 0, -1);
    let recoveredCount = 0;

    for (const jobId of jobIds) {
      const job = await prisma.job.findUnique({
        where: { id: jobId },
      });

      // 1. Missing job ID in PostgreSQL -> remove from processing-queue
      if (!job) {
        await redisClient.lrem(REDIS_KEYS.PROCESSING_QUEUE, 1, jobId);
        recoveredCount++;
        continue;
      }

      // 2. Job already finished or cancelled -> clean up from processing-queue
      if (["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) {
        await redisClient.lrem(REDIS_KEYS.PROCESSING_QUEUE, 1, jobId);
        recoveredCount++;
        continue;
      }

      // 3. Job is RETRYING but still in processing-queue (e.g. worker crashed before LREM)
      if (job.status === "RETRYING") {
        await redisClient.lrem(REDIS_KEYS.PROCESSING_QUEUE, 1, jobId);
        recoveredCount++;
        continue;
      }

      // 4. Job is QUEUED (moved by RPOPLPUSH, but claiming worker crashed before DB claim or failed OCC)
      if (job.status === "QUEUED" && !job.workerId) {
        const isStale = Date.now() - new Date(job.updatedAt).getTime() >= staleThresholdMs;
        if (isStale) {
          // Atomically ensure it's still QUEUED without a worker
          const claimed = await prisma.job.updateMany({
            where: {
              id: job.id,
              status: "QUEUED",
              workerId: null,
              version: job.version,
            },
            data: {
              version: { increment: 1 },
            },
          });

          if (claimed.count > 0) {
            await this.queueService.enqueue(job.id, job.priority || "MEDIUM");
            await redisClient.lrem(REDIS_KEYS.PROCESSING_QUEUE, 1, jobId);
            await this.eventService.createEvent(job.id, "JOB_RECOVERED", {
              reason: "STRANDED_IN_PROCESSING_QUEUE",
            });
            recoveredCount++;
          }
        }
      }
    }

    return recoveredCount;
  }
}
