import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class EventService {
  async createEvent(
    jobId: string,
    eventType: string,
    details?: any,
  ) {
    return prisma.jobEvent.create({
      data: {
        jobId,
        eventType,
        details,
      },
    });
  }
}