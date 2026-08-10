const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function toWebhookPayload(event, job, result) {
    const payload = job.payload;
    let output = null;

    if (result) {
      try {
        output = typeof result.payload === "string" ? JSON.parse(result.payload) : result.payload;
      } catch (e) {
        output = result.payload;
      }
    }

    const eventId = crypto
      .createHash('sha256')
      .update(`${job.id}:${event.type}:${event.timestamp}`)
      .digest('hex');

    return {
      eventId,
      specVersion: "1.0",
      eventType: event.type === "JOB_COMPLETED" ? "TASK_COMPLETED" : "TASK_FAILED",
      occurredAt: new Date().toISOString(),
      payload: {
        taskRunId: payload.taskRunId,
        workflowRunId: payload.workflowRunId,
        workflowVersion: payload.workflowVersion,
        correlationId: payload.correlationId,
        output: output,
        error: event.type === "JOB_FAILED" ? (event.payload)?.details?.reason || job.failureReason : undefined
      }
    };
}

function generateFixture() {
  const event = {
    type: 'JOB_COMPLETED',
    timestamp: '1680000000000', 
  };

  const job = {
    id: 'test-job-id',
    payload: {
      taskRunId: 'tr_123',
      workflowRunId: 'wr_456',
      workflowVersion: 1,
      correlationId: 'corr_789',
    },
    failureReason: null,
  };

  const result = {
    payload: JSON.stringify({ hello: 'world' }),
  };

  let payload = toWebhookPayload(event, job, result);
  payload.occurredAt = '2026-01-01T00:00:00.000Z';
  payload = JSON.parse(JSON.stringify(payload));

  const fixturePath = path.join(__dirname, 'webhook-event-fixture.json');
  fs.writeFileSync(fixturePath, JSON.stringify(payload, null, 2), 'utf-8');

  console.log(`Fixture generated at ${fixturePath}`);
}

generateFixture();
