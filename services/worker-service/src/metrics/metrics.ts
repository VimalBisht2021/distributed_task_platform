import client from "prom-client";

export const register = new client.Registry();

client.collectDefaultMetrics({
  register,
});

export const jobsCompletedCounter = new client.Counter({
  name: "jobs_completed_total",
  help: "Total completed jobs",
  registers: [register],
});

export const jobsFailedCounter = new client.Counter({
  name: "jobs_failed_total",
  help: "Total failed jobs",
  registers: [register],
});

export const jobProcessingDuration = new client.Histogram({
  name: "job_processing_duration_seconds",
  help: "Time spent processing jobs",
  buckets: [1, 2, 5, 10, 20, 30, 60],
  registers: [register],
});

export const jobsRetriedCounter = new client.Counter({
  name: "jobs_retried_total",
  help: "Total retried jobs",
  registers: [register],
});

export const queueWaitDuration = new client.Histogram({
  name: "job_queue_wait_seconds",
  help: "Time jobs spend waiting in the queue",
  buckets: [1, 2, 5, 10, 20, 30, 60, 120],
  registers: [register],
});

export const workerUtilizationGauge = new client.Gauge({
  name: "worker_utilization_percent",
  help: "Current worker utilization percentage",
  labelNames: ["worker_id"],
  registers: [register],
});
