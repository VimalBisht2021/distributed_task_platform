import { Request, Response } from "express";
import { MetricsService } from "../services/metrics.service";
import { getWorkerMetrics } from "../services/worker-metrics.service";

const metricsService = new MetricsService();

export async function getJobs(req: Request, res: Response) {
  const metrics = await metricsService.getJobMetrics();

  res.json(metrics);
}

export async function getWorkers(req: Request, res: Response) {
  try {
    const workers = await getWorkerMetrics();
    

    res.json(workers);
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch worker metrics",
    });
  }
}
