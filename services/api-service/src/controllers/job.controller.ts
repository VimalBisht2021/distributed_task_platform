import { Request, Response } from "express";
import { createJobSchema } from "../dto/create-job.dto";
import { JobService } from "../services/job.service";
import { jobsCreatedCounter }
from "../metrics/metrics";

const jobService = new JobService();

export class JobController {
  async create(req: Request, res: Response) {
    try {
      const dto = createJobSchema.parse(req.body);

      const userId = req.user?.userId as string;
      const result = await jobService.createJob(userId, dto);

      jobsCreatedCounter.inc();
      return res.status(201).json(result);
    } catch (error: any) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const userId = req.user?.userId as string;
      const role = req.user?.role as string;
      const result = await jobService.getJob(
        req.params.jobId as string,
        userId,
        role,
      );
      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
  async getAll(req: Request, res: Response) {
    try {
      const userId = req.user?.userId as string;
      const role = req.user?.role as string;
      const jobs = await jobService.getUserJobs(userId, role);

      return res.status(200).json(jobs);
    } catch (error: any) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }

  async cancel(req: Request, res: Response) {
    try {
      const userId = req.user?.userId as string;
      const role = req.user?.role as string;
      const result = await jobService.cancelJob(
        req.params.jobId as string,
        userId,
        role,
      );

      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
  async retry(req: Request, res: Response) {
    try {
      const userId = req.user?.userId as string;
      const role = req.user?.role as string;
      const result = await jobService.retryJob(
        req.params.jobId as string,
        userId,
        role,
      );

      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(400).json({
        message: error.message,
      });
    }
  }
}
