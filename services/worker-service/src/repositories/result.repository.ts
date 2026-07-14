import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export class ResultRepository {
  async create(
    jobId: string,
    resultType: string,
    resultUrl: string,
    size?: number
  ) {
    return prisma.result.create({
      data: {
        jobId,
        resultType,
        resultUrl,
        size,
      },
    });
  }
}