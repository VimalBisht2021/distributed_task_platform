import { ProgressService } from "../services/progress.service";
import { EventService } from "../services/event.service";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const progressService = new ProgressService();
const eventService = new EventService();

export async function processJob(jobId: string, jobType: string, payload?: any) {
  console.log(`Executing ${jobId} of type ${jobType}`);

  const defaultDelay = 5000;
  const envDelay = process.env.TEST_PROCESSOR_DELAY ? parseInt(process.env.TEST_PROCESSOR_DELAY) : defaultDelay;
  const delay = payload?.delay ? payload.delay : envDelay;

  // Mock progress updates
  for (let i = 1; i <= 4; i++) {
    await sleep(delay / 4);
    const progress = i * 20;
    await progressService.updateProgress(jobId, progress);
    await eventService.createEvent(jobId, "JOB_PROGRESS", undefined, { progress });
  }

  // Registry pattern based on jobType
  let resultPayload = null;
  switch (jobType) {
    case 'HTTP':
      resultPayload = { statusCode: 200, body: 'HTTP request successful' };
      break;
    case 'EMAIL':
      resultPayload = { sentTo: payload?.to || 'default@example.com', success: true };
      break;
    case 'AI':
      resultPayload = { text: 'Mocked AI completion', tokensUsed: 42 };
      break;
    case 'PYTHON':
      resultPayload = { exitCode: 0, stdout: 'Script completed successfully' };
      break;
    default:
      resultPayload = { message: `Job ${jobId} completed successfully` };
      break;
  }

  return {
    resultType: "JSON",
    payload: resultPayload,
  };
}