import { PrismaClient } from "@prisma/client";
import { SystemEventMessage } from "../../../../shared/types";
import { EventService } from "../services/event.service";
import { ExecutionEventMapper } from "./execution-event.mapper";
import { WebhookClient } from "./webhook.client";

const prisma = new PrismaClient();

export class WebhookDispatcherService {
  private eventService = new EventService();

  start() {
    this.eventService.subscribeToEvents(this.handleEvent.bind(this));
    console.log("WebhookDispatcherService (Integration) started");
  }

  private async handleEvent(event: SystemEventMessage) {
    if (event.type !== "JOB_COMPLETED" && event.type !== "JOB_FAILED") {
      return;
    }

    try {
      const job = await prisma.job.findUnique({
        where: { id: event.jobId }
      });

      if (!job) {
        return;
      }

      const callbackObj = job.callback ? (job.callback as any) : null;
      const callbackUrl = callbackObj?.url;
      // Note: We don't use callbackObj?.apiKey anymore as per DTP-2 gap 1. We rely on shared WEBHOOK_SECRET.

      if (!callbackUrl) {
        return; // Not a WOE task or no webhook requested
      }

      // Fetch result if completed
      let result = null;
      if (event.type === "JOB_COMPLETED") {
        result = await prisma.result.findUnique({
          where: { jobId: event.jobId }
        });
      }

      const webhookPayload = ExecutionEventMapper.toWebhookPayload(event, job, result);

      const maxRetries = 3;
      let attempt = 0;
      let success = false;

      while (attempt <= maxRetries && !success) {
        try {
          await WebhookClient.send(callbackUrl, webhookPayload);
          success = true;
        } catch (err) {
          attempt++;
          if (attempt > maxRetries) {
            console.error(`[WebhookDispatcher] Failed to send webhook after ${maxRetries} retries for job ${job.id}`);
            // This is where DLQ or reconciliation record would go
            break;
          }
          const baseDelay = 1000 * Math.pow(2, attempt - 1);
          const jitter = Math.random() * 500;
          const delay = baseDelay + jitter;
          console.log(`[WebhookDispatcher] Webhook failed, retrying in ${Math.round(delay)}ms... (Attempt ${attempt}/${maxRetries})`);
          await new Promise(res => setTimeout(res, delay));
        }
      }

    } catch (error) {
      console.error("[WebhookDispatcher] Error processing event:", error);
    }
  }
}
