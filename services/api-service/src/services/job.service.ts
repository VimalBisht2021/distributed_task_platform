import { CreateJobDto } from "../dto/create-job.dto";
import { JobDto } from "../../../../shared/types";
import { JobRepository } from "../repositories/job.repository";
import { enqueueJob } from "../redis/queues";
import { EventService } from "./event.service";
export class JobService {
  private jobRepository = new JobRepository();
  private eventService = new EventService();

 async createJob(userId: string, dto: CreateJobDto) {
  const job = await this.jobRepository.create({
    userId,
    jobType: dto.jobType,
    payload: dto.payload,
    priority: dto.priority,
  });

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
  async getJob(jobId: string, userId: string): Promise<JobDto> {
    const job = await this.jobRepository.findById(jobId);

    if (!job) {
      throw new Error("Job not found");
    }

    if (userId !== "admin" && job.userId !== userId) {
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

  async getUserJobs(userId: string): Promise<JobDto[]> {
    const jobs = await this.jobRepository.findByUserId(userId);

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

  async cancelJob(jobId: string, userId: string) {
    const job = await this.jobRepository.findById(jobId);

    if (!job) {
      throw new Error("Job not found");
    }

    if (job.userId !== userId) {
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

  async retryJob(jobId: string, userId: string) {
    const job = await this.jobRepository.findById(jobId);

    if (!job) {
      throw new Error("Job not found");
    }

    if (job.userId !== userId) {
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
}
