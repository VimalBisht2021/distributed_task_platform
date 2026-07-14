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
}