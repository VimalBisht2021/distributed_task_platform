import { CreateJobDto } from "../dto/create-job.dto";
import { JobDto, JobResultDto } from "../../../../shared/types";
import { JobRepository } from "../repositories/job.repository";
import { enqueueJob } from "../redis/queues";
import { EventService } from "./event.service";
export class JobService {
  private jobRepository = new JobRepository();
  private eventService = new EventService();

  async createJob(userId: string, dto: CreateJobDto) {
    if (dto.idempotencyKey) {
      const existing = await this.jobRepository.findByIdempotencyKey(dto.idempotencyKey);
      if (existing) {
        return {
          jobId: existing.id,
          status: existing.status,
          priority: existing.priority,
        };
      }
    }

    let job;
    try {
      job = await this.jobRepository.create({
        userId,
        jobType: dto.jobType,
        payload: dto.payload,
        priority: dto.priority,
        idempotencyKey: dto.idempotencyKey,
        callback: dto.callback,
      });
    } catch (error: any) {
      // Prisma unique constraint violation code is P2002
      if (error.code === 'P2002' && dto.idempotencyKey) {
        const existing = await this.jobRepository.findByIdempotencyKey(dto.idempotencyKey);
        if (existing) {
          return {
            jobId: existing.id,
            status: existing.status,
            priority: existing.priority,
          };
        }
      }
      throw error;
    }

    await this.eventService.createEvent(
      job.id,
      "JOB_CREATED"
    );

    try {
      await enqueueJob(job.id, dto.priority || "MEDIUM");

      await this.eventService.createEvent(
        job.id,
        "JOB_QUEUED"
      );

      await this.jobRepository.updateStatus(
        job.id,
        "QUEUED"
      );

      return {
        jobId: job.id,
        status: "QUEUED",
        priority: job.priority,
      };
    } catch (error) {
      await this.jobRepository.updateStatus(
        job.id,
        "PENDING"
      );

      return {
        jobId: job.id,
        status: "PENDING",
        priority: job.priority,
      };
    }
  }

  async getJob(jobId: string, userId: string, role?: string): Promise<JobDto> {
    const job = await this.jobRepository.findById(jobId);

    if (!job) {
      throw new Error("Job not found");
    }

    if (role !== "ADMIN" && role !== "DISPATCHER" && job.userId !== userId) {
      throw new Error("Forbidden");
    }

    const events = await this.eventService.findByJobId(jobId);

    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      jobType: job.jobType,
      workerId: job.workerId || undefined,
      retryCount: job.retryCount,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      events: events.map((e) => ({
        id: e.id,
        jobId: e.jobId,
        eventType: e.eventType,
        workerId: e.workerId || undefined,
        details: e.details,
        createdAt: e.createdAt,
      })),
    };
  }

  async getJobByIdempotencyKey(idempotencyKey: string, userId: string, role?: string) {
    const job = await this.jobRepository.findByIdempotencyKey(idempotencyKey);

    if (!job) {
      throw new Error("Job not found");
    }

    if (role !== "ADMIN" && role !== "DISPATCHER" && job.userId !== userId) {
      throw new Error("Forbidden");
    }

    const events = await this.eventService.findByJobId(job.id);
    const result = await this.jobRepository.getResult(job.id);

    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      jobType: job.jobType,
      workerId: job.workerId || undefined,
      retryCount: job.retryCount,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      result: result?.payload || undefined,
      error: job.failureReason || undefined,
      events: events.map((e) => ({
        id: e.id,
        jobId: e.jobId,
        eventType: e.eventType,
        workerId: e.workerId || undefined,
        details: e.details,
        createdAt: e.createdAt,
      })),
    };
  }

  async getUserJobs(userId: string, role?: string, limit: number = 50, offset: number = 0): Promise<JobDto[]> {
    const jobs = await this.jobRepository.findByUserId(userId, role, limit, offset);

    return jobs.map((job) => ({
      jobId: job.id,
      jobType: job.jobType,
      status: job.status,
      progress: job.progress,
      workerId: job.workerId || undefined,
      retryCount: job.retryCount,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }));
  }

  async cancelJob(jobId: string, userId: string, role?: string) {
    const job = await this.jobRepository.findById(jobId);

    if (!job) {
      throw new Error("Job not found");
    }

    if (role !== "ADMIN" && job.userId !== userId) {
      throw new Error("Forbidden");
    }

    const allowedStatuses = ["PENDING", "QUEUED", "RETRYING"];

    if (!allowedStatuses.includes(job.status)) {
      throw new Error(`Cannot cancel job with status ${job.status}`);
    }

    const updatedJob = await this.jobRepository.updateStatus(
      jobId,
      "CANCELLED",
    );

    return {
      jobId: updatedJob.id,
      status: updatedJob.status,
    };
  }

  async retryJob(jobId: string, userId: string, role?: string) {
    const job = await this.jobRepository.findById(jobId);

    if (!job) {
      throw new Error("Job not found");
    }

    if (role !== "ADMIN" && job.userId !== userId) {
      throw new Error("Forbidden");
    }

    if (job.status !== "FAILED") {
      throw new Error(`Cannot retry job with status ${job.status}`);
    }

    const updatedJob = await this.jobRepository.retryJob(jobId);

    return {
      jobId: updatedJob.id,
      status: updatedJob.status,
      retryCount: updatedJob.retryCount,
    };
  }

  async getJobResult(jobId: string, userId: string, role?: string): Promise<JobResultDto> {
    const job = await this.jobRepository.findById(jobId);

    if (!job) {
      throw new Error("Job not found");
    }

    if (role !== "ADMIN" && job.userId !== userId) {
      throw new Error("Forbidden");
    }

    const result = await this.jobRepository.getResult(jobId);

    if (!result) {
      throw new Error("Result not found");
    }

    return {
      jobId: result.jobId,
      resultType: result.resultType,
      resultUrl: result.resultUrl,
      size: result.size || undefined,
      payload: result.payload || undefined,
      createdAt: result.createdAt,
    };
  }
}
