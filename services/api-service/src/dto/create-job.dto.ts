import { z } from "zod";

export const createJobSchema = z.object({
  idempotencyKey: z.string().optional(),
  jobType: z.string().min(1, "Job type is required"),
  payload: z.record(z.string(), z.any()),
  callback: z.object({
    url: z.string().url(),
    apiKey: z.string().optional(),
    timeout: z.number().optional(),
    retryPolicy: z.any().optional(),
  }).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
});

export type CreateJobDto = z.infer<typeof createJobSchema>;

