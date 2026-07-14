import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class ProgressService {
  async updateProgress(
    jobId: string,
    progress: number,
  ) {
    await prisma.job.update({
      where: {
        id: jobId,
      },
      data: {
        progress,
      },
    });
  }
}