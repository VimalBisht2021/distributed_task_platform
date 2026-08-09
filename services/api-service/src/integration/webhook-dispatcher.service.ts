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

      const callbackObj = (job as any).callback;
      const callbackUrl = callbackObj?.url || (job.payload as any)?.webhookUrl;
      const callbackSecret = callbackObj?.apiKey;

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

      try {
        await WebhookClient.send(callbackUrl, webhookPayload, callbackSecret);
      } catch (err) {
        // Retry logic could go here
      }

    } catch (error) {
      console.error("[WebhookDispatcher] Error processing event:", error);
    }
  }
}
