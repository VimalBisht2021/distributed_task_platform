import { JobStatus } from "@prisma/client";
import { prisma } from "../config/prisma";

export class JobRepository {
  async create(data: { userId: string; jobType: string; payload: any; priority?: string; idempotencyKey?: string; callback?: any }) {
    return prisma.job.create({
      data: {
        userId: data.userId,
        jobType: data.jobType,
        payload: data.payload,
        priority: (data.priority as any) || "MEDIUM",
        idempotencyKey: data.idempotencyKey,
        callback: data.callback ? (data.callback as any) : undefined,
      },
    });
  }

  async findById(jobId: string) {
    return prisma.job.findUnique({
      where: {
        id: jobId,
      },
    });
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    return prisma.job.findUnique({
      where: { idempotencyKey }
    });
  }

  async findByUserId(userId: string, role?: string, limit: number = 50, offset: number = 0) {
    if (role === "ADMIN" || role === "DISPATCHER") {
      return prisma.job.findMany({
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
      });
    }
    return prisma.job.findMany({
      where: {
        userId,
      },
      take: limit,
      skip: offset,
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

  async getResult(jobId: string) {
    return prisma.result.findUnique({
      where: {
        jobId,
      },
    });
  }
}
