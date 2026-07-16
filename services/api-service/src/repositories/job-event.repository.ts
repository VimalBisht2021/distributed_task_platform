import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class JobEventRepository {
  async create(
    jobId: string,
    eventType: string,
    workerId?: string,
    details?: any
  ) {
    return prisma.jobEvent.create({
      data: {
        jobId,
        eventType,
        workerId,
        details,
      },
    });
  }

  async findByJobId(jobId: string) {
    return prisma.jobEvent.findMany({
      where: {
        jobId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  }

  async getRecentRecoveryEvents(limit: number = 50) {
    return prisma.jobEvent.findMany({
      where: {
        eventType: {
          in: ["JOB_RECOVERED", "JOB_RETRY_SCHEDULED", "JOB_DLQ"],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
      include: {
        job: {
          select: {
            jobType: true,
          }
        }
      }
    });
  }
}