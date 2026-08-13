import { exec } from 'child_process';
import { promisify } from 'util';
import dns from 'dns';
import { URL } from 'url';

const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  if (typeof url === 'string') {
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname === 'task-platform-api' || urlObj.hostname.includes('api')) {
        const { address } = await dns.promises.lookup(urlObj.hostname, { family: 4 });
        urlObj.hostname = address;
        url = urlObj.toString();
      }
    } catch(e) {
      // ignore
    }
  }
  return originalFetch(url, options);
};

const execAsync = promisify(exec);

export const API_URL = process.env.API_URL || 'http://task-platform-api:3000';
export const REDIS_HOST = process.env.REDIS_HOST || 'task-platform-redis';

export async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run a docker command. Uses DOCKER_HOST env var if set (for DinD).
 * Falls back to local docker.
 */
export async function runDockerCommand(command: string): Promise<string> {
  const { stdout, stderr } = await execAsync(`docker ${command}`);
  if (stderr && !stderr.includes('Starting') && !stderr.includes('Started') && !stderr.includes('Container')) {
    console.warn(`Docker warning: ${stderr}`);
  }
  return stdout.trim();
}

export async function getToken(): Promise<string> {
  // First try to register (ignore error if exists)
  try {
    await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@system.local', password: 'password123', role: 'ADMIN' })
    });
  } catch (e) {
    // Ignore
  }

  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@system.local', password: 'password123' })
  });
  
  const data = await res.json();
  if (!data.token) {
    throw new Error('Failed to authenticate');
  }
  return data.token;
}

export async function submitJob(token: string, priority: string, label: string, delay?: number): Promise<string> {
  const payload: any = { label };
  if (delay) payload.delay = delay;
  
  const res = await fetch(`${API_URL}/jobs`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      jobType: "TEST_JOB",
      payload,
      priority
    })
  });
  
  const data = await res.json();
  return data.jobId;
}

export async function getJobStatus(token: string, jobId: string): Promise<string | null> {
  const res = await fetch(`${API_URL}/jobs/${jobId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  return data.status || null;
}

export async function waitForJob(token: string, jobId: string, logCallback?: (msg: string) => void, timeoutMs: number = 60000): Promise<string> {
  if (logCallback) logCallback(`Waiting for job ${jobId} to complete...`);
  const deadline = Date.now() + timeoutMs;
  
  while (Date.now() < deadline) {
    const status = await getJobStatus(token, jobId);
    if (status === 'COMPLETED') {
      if (logCallback) logCallback(`Job ${jobId} completed!`);
      return status;
    }
    if (status === 'FAILED') {
      if (logCallback) logCallback(`Job ${jobId} failed!`);
      throw new Error(`Job ${jobId} failed`);
    }
    await sleep(1000);
  }
  throw new Error(`Job ${jobId} timed out after ${timeoutMs / 1000}s`);
}
