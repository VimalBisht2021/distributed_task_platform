import { ProgressService } from "../services/progress.service";
import { EventService } from "../services/event.service";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const progressService = new ProgressService();
const eventService = new EventService();

export async function processJob(jobId: string, payload?: any) {
  console.log(`Executing ${jobId}`);

  const defaultDelay = 5000;
  const envDelay = process.env.TEST_PROCESSOR_DELAY ? parseInt(process.env.TEST_PROCESSOR_DELAY) : defaultDelay;
  const delay = payload?.delay ? payload.delay : envDelay;

  for (let i = 1; i <= 4; i++) {
    await sleep(delay);
    const progress = i * 20;
    await progressService.updateProgress(jobId, progress);
    await eventService.createEvent(jobId, "JOB_PROGRESS", undefined, { progress });
  }

  await sleep(delay);

  return {
    resultType: "TEXT",
    content: `Job ${jobId} completed successfully`,
  };
}