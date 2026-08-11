import { ProgressService } from "../services/progress.service";
import { EventService } from "../services/event.service";
import * as dns from "dns";
import { promisify } from "util";

const lookup = promisify(dns.lookup);

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
    case 'HTTP': {
      const targetUrl = payload?.url ?? payload?.input?.url;
      if (!targetUrl || typeof targetUrl !== 'string') {
        throw new Error('HTTP job requires a valid URL in payload');
      }
      const urlObj = new URL(targetUrl);
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        throw new Error('SSRF Protection: Only HTTP/HTTPS protocols are allowed');
      }
      if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1' || urlObj.hostname === '::1' || urlObj.hostname === '0.0.0.0') {
        throw new Error('SSRF Protection: Localhost is not allowed');
      }
      
      const { address } = await lookup(urlObj.hostname);
      if (address === '127.0.0.1' || address === '::1' || address === '0.0.0.0' || 
          address.startsWith('10.') || address.startsWith('192.168.') || address.startsWith('169.254.') || 
          /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(address)) {
        throw new Error('SSRF Protection: Private/local IPs are not allowed');
      }

      try {
        const method = payload?.method ?? payload?.input?.method ?? 'GET';
        const headers = payload?.headers ?? payload?.input?.headers ?? {};
        const bodyData = payload?.body ?? payload?.input?.body;
        const body = bodyData ? (typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData)) : undefined;
        
        const response = await fetch(targetUrl, { method, headers, body });
        const responseText = await response.text();
        
        let responseJson;
        try {
          responseJson = JSON.parse(responseText);
        } catch {
          responseJson = responseText;
        }

        resultPayload = { 
          statusCode: response.status, 
          body: responseJson 
        };
      } catch (err: any) {
        throw new Error(`HTTP request failed: ${err.message}`);
      }
      break;
    }
    case 'EMAIL':
      resultPayload = { sentTo: payload?.to || 'default@example.com', success: true, note: '[STUB] Mocked EMAIL execution' };
      break;
    case 'AI':
      resultPayload = { text: '[STUB] Mocked AI completion', tokensUsed: 42 };
      break;
    case 'PYTHON':
      resultPayload = { exitCode: 0, stdout: '[STUB] Script completed successfully' };
      break;
    case 'SCRIPT':
      throw new Error('SCRIPT execution is not sandboxed yet. Failing closed for security.');
    default:
      resultPayload = { message: `[STUB] Job ${jobId} completed successfully (mock default)` };
      break;
  }

  return {
    resultType: "JSON",
    payload: resultPayload,
  };
}