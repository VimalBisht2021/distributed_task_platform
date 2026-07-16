import { PrismaClient } from "@prisma/client";
import { QueueService } from "./queue.service";
import { EventService } from "./event.service";

const prisma = new PrismaClient();

export class RetryService {
  private queueService = new QueueService();
  private eventService = new EventService();

  async processRetries() {
    const jobs = await this.getRetryingJobs();

    let requeuedCount = 0;
    for (const job of jobs) {
      await this.queueService.enqueue(job.id, job.priority || "MEDIUM");
      await this.markQueued(job.id);
      await this.eventService.createEvent(
        job.id,
        "JOB_REQUEUED",
        { retryCount: job.retryCount },
      );
      console.log(`Requeued ${job.id} (retry ${job.retryCount})`);
      requeuedCount++;
    }
    return requeuedCount;
  }

  async getRetryingJobs() {
  return prisma.job.findMany({
    where: {
      status: "RETRYING",
      nextRetryAt: {
        lte: new Date(),
      },
    },
    orderBy: {
      updatedAt: "asc",
    },
    take: 100,
  });
}

    async markQueued(jobId: string){
        return prisma.job.update({
            where:{
                id:jobId,
            },
            data:{
                status: "QUEUED",
                nextRetryAt: null,
            },
        });
    }
}