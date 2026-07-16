import { PrismaClient } from "@prisma/client";
import { SystemMetricsDto } from "../../../../shared/types";

const prisma = new PrismaClient();

export class MetricsService {
  async getJobMetrics(): Promise<SystemMetricsDto> {
    const [
      pending,
      queued,
      running,
      completed,
      failed,
      retrying,
    ] = await Promise.all([
      prisma.job.count({
        where: { status: "PENDING" },
      }),
      prisma.job.count({
        where: { status: "QUEUED" },
      }),
      prisma.job.count({
        where: { status: "RUNNING" },
      }),
      prisma.job.count({
        where: { status: "COMPLETED" },
      }),
      prisma.job.count({
        where: { status: "FAILED" },
      }),
      prisma.job.count({
        where: { status: "RETRYING" },
      }),
    ]);

    return {
      pending,
      queued,
      running,
      completed,
      failed,
      retrying,
    };
  }
}