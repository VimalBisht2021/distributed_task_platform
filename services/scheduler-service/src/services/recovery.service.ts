import { PrismaClient } from "@prisma/client";
import { EventService } from "./event.service";
import { redisClient } from "../redis/redisClient";
import { REDIS_KEYS } from "../redis/keys";

const prisma = new PrismaClient();

export class RecoveryService {
  private eventService = new EventService();

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
        },
        data: {
          status: "RETRYING",
          workerId: null,
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
}
