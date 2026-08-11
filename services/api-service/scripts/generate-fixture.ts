import { ExecutionEventMapper } from '../src/integration/execution-event.mapper';
import * as fs from 'fs';
import * as path from 'path';

function generateFixture() {
  // Mock Date.now to pin occurredAt and make the hash deterministic
  const mockTimestamp = 1714521600000; // 2024-05-01T00:00:00.000Z
  const originalDateNow = Date.now;
  Date.now = () => mockTimestamp;

  const event: any = {
    type: 'JOB_COMPLETED',
    timestamp: '1680000000000', // Deterministic timestamp for event source
    jobId: 'test-job-id'
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

  try {
    let payload = ExecutionEventMapper.toWebhookPayload(event, job, result);

    payload.occurredAt = '2024-05-01T00:00:00.000Z';

    // Round-trip through JSON to drop `undefined` fields (like error)
    payload = JSON.parse(JSON.stringify(payload));

    const fixturePath = path.join(__dirname, 'webhook-event-fixture.json');
    fs.writeFileSync(fixturePath, JSON.stringify(payload, null, 2), 'utf-8');

    console.log(`Fixture generated at ${fixturePath}`);
  } finally {
    Date.now = originalDateNow;
  }
}

generateFixture();
