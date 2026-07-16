import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const API_URL = process.env.API_URL || 'http://localhost:3000';

export async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function runDockerCommand(command: string): Promise<string> {
  // Use docker command directly. Assuming running on host.
  // Add -p to ensure we control the existing project, not a new 'host' project
  let modifiedCommand = command.startsWith('compose ') ? command.replace('compose ', 'compose -p distributed-task-platform ') : command;
  
  if (modifiedCommand.includes('compose -p distributed-task-platform up')) {
    modifiedCommand += ' worker-service scheduler-service';
  }

  const { stdout, stderr } = await execAsync(`docker ${modifiedCommand}`, { cwd: '/host' });
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

export async function waitForJob(token: string, jobId: string, logCallback?: (msg: string) => void): Promise<string> {
  if (logCallback) logCallback(`Waiting for job ${jobId} to complete...`);
  
  while (true) {
    const status = await getJobStatus(token, jobId);
    if (status === 'COMPLETED') {
      if (logCallback) logCallback(`Job ${jobId} completed!`);
      return status;
    }
    if (status === 'FAILED' || !status) {
      if (logCallback) logCallback(`Job ${jobId} failed!`);
      throw new Error(`Job ${jobId} failed`);
    }
    await sleep(1000);
  }
}
