import { ExecutionEventMapper } from '../src/integration/execution-event.mapper';
import * as fs from 'fs';
import * as path from 'path';

function generateFixture() {
  const event: any = {
    type: 'JOB_COMPLETED',
    timestamp: 1680000000000, // Deterministic timestamp for deterministic hash
  };

  const job: any = {
    id: 'test-job-id',
    payload: {
      taskRunId: 'tr_123',
      workflowRunId: 'wr_456',
      workflowVersion: 1,
      correlationId: 'corr_789',
    },
    failureReason: null,
  };

  const result: any = {
    payload: JSON.stringify({ hello: 'world' }),
  };

  let payload = ExecutionEventMapper.toWebhookPayload(event, job, result);

  // Force deterministic fields for the fixture
  payload.occurredAt = '2026-01-01T00:00:00.000Z';
  payload.eventId = 'test-event-id'; // or let the mapper output it and assert against that, but deterministic is easier

  // Round-trip through JSON to drop `undefined` fields (like error)
  payload = JSON.parse(JSON.stringify(payload));

  const fixturePath = path.join(__dirname, 'webhook-event-fixture.json');
  fs.writeFileSync(fixturePath, JSON.stringify(payload, null, 2), 'utf-8');

  console.log(`Fixture generated at ${fixturePath}`);
}

generateFixture();
