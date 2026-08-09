import { SystemEventMessage } from "../../../../shared/types";
import { Job, Result } from "@prisma/client";

import * as crypto from 'crypto';

export class ExecutionEventMapper {
  static toWebhookPayload(
    event: SystemEventMessage,
    job: Job,
    result: Result | null
  ) {
    const payload = job.payload as Record<string, any>;
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
        error: event.type === "JOB_FAILED" ? (event.payload as any)?.details?.reason || job.failureReason : undefined
      }
    };
  }
}
