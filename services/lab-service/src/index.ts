import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import runPriorityScenario from './scenarios/priority';
import runRecoveryScenario from './scenarios/recovery';
import runFailoverScenario from './scenarios/failover';
import runBenchmarkScenario from './scenarios/benchmark';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

interface LabRun {
  id: string;
  scenario: string;
  status: 'RUNNING' | 'PASS' | 'FAIL';
  startedAt: string;
  finishedAt?: string;
  result?: string;
  logs: string[];
}

const runs: Record<string, LabRun> = {};
// SSE clients connected to a run stream
const streamClients: Record<string, express.Response[]> = {};

function pushLog(runId: string, msg: string) {
  const run = runs[runId];
  if (!run) return;
  run.logs.push(msg);
  console.log(`[${runId}] ${msg}`);
  
  const clients = streamClients[runId] || [];
  clients.forEach(client => {
    client.write(`data: ${JSON.stringify({ type: 'LOG', message: msg })}\n\n`);
  });
}

function pushStatus(runId: string, status: string, result?: string) {
  const clients = streamClients[runId] || [];
  clients.forEach(client => {
    client.write(`data: ${JSON.stringify({ type: 'STATUS', status, result })}\n\n`);
  });
}

app.post('/runs', async (req, res) => {
  const { scenario } = req.body;
  if (!['priority', 'recovery', 'failover', 'benchmark'].includes(scenario)) {
    return res.status(400).json({ error: 'Invalid scenario' });
  }

  const runId = `run_${uuidv4().substring(0, 8)}`;
  runs[runId] = {
    id: runId,
    scenario,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    logs: []
  };

  res.json(runs[runId]);

  const logFn = (msg: string) => pushLog(runId, msg);

  // Execute scenario asynchronously
  (async () => {
    try {
      if (scenario === 'priority') await runPriorityScenario(logFn);
      if (scenario === 'recovery') await runRecoveryScenario(logFn);
      if (scenario === 'failover') await runFailoverScenario(logFn);
      if (scenario === 'benchmark') await runBenchmarkScenario(logFn);

      runs[runId].status = 'PASS';
      runs[runId].result = 'PASS';
    } catch (error: any) {
      logFn(`Error: ${error.message}`);
      runs[runId].status = 'FAIL';
      runs[runId].result = 'FAIL';
    } finally {
      runs[runId].finishedAt = new Date().toISOString();
      pushStatus(runId, runs[runId].status, runs[runId].result);
    }
  })();
});

app.get('/runs/:id', (req, res) => {
  const run = runs[req.params.id];
  if (!run) return res.status(404).json({ error: 'Not found' });
  res.json(run);
});

app.get('/runs/:id/stream', (req, res) => {
  const runId = req.params.id;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!streamClients[runId]) {
    streamClients[runId] = [];
  }
  streamClients[runId].push(res);

  req.on('close', () => {
    streamClients[runId] = streamClients[runId].filter(client => client !== res);
  });
});

const PORT = process.env.PORT || 3006;
app.listen(PORT, () => {
  console.log(`Lab Service running on port ${PORT}`);
});
