import { describe, it, expect } from 'vitest';
import { ExecutionEventMapper } from './execution-event.mapper';
import * as fs from 'fs';
import * as path from 'path';
import { SystemEventMessage } from '../../../../shared/types';
import { Job, Result } from '@prisma/client';

describe('ExecutionEventMapper Contract Drift Test', () => {
  it('should match the checked-in fixture', () => {
    const fixturePath = path.join(__dirname, '../../scripts/webhook-event-fixture.json');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

    const event: SystemEventMessage = {
      jobId: 'test-job-id',
      source: 'worker',
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
    } as unknown as Job;

    const result = {
      payload: JSON.stringify({ hello: 'world' }),
    } as unknown as Result;

    let payload = ExecutionEventMapper.toWebhookPayload(event, job, result);

    // Drop undefined fields and convert dates to strings via JSON round-trip
    payload = JSON.parse(JSON.stringify(payload));

    // Exclude non-deterministic fields from the test payload
    const { eventId, occurredAt, ...testPayload } = payload;
    
    // Exclude non-deterministic fields from the fixture payload
    const { eventId: fEventId, occurredAt: fOccurredAt, ...fixturePayload } = fixture;

    expect(testPayload).toEqual(fixturePayload);
  });
});
