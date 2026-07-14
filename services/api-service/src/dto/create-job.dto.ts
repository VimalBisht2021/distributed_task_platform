import { z } from "zod";

export const createJobSchema = z.object({
  jobType: z.string().min(1, "Job type is required"),
  payload: z.record(z.string(), z.any()),
});

export type CreateJobDto = z.infer<typeof createJobSchema>;

