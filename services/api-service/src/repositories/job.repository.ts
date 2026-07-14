import { JobStatus } from "@prisma/client";
import { prisma } from "../config/prisma";

export class JobRepository {
  async create(data: { userId: string; jobType: string; payload: any }) {
    return prisma.job.create({
      data,
    });
  }

  async findById(jobId: string) {
    return prisma.job.findUnique({
      where: {
        id: jobId,
      },
    });
  }

  async findByUserId(userId: string) {
    return prisma.job.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }
  async updateStatus(jobId: string, status: JobStatus) {
    return prisma.job.update({
      where: {
        id: jobId,
      },
      data: {
        status,
      },
    });
  }

  async retryJob(jobId: string) {
    return prisma.job.update({
      where: {
        id: jobId,
      },
      data: {
        status: "PENDING",
        retryCount: {
          increment: 1,
        },
        failureReason: null,
      },
    });
  }

  
}
