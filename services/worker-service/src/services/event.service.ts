import { JobEventRepository } from "../repositories/job-event.repository";
import { redisClient } from "../redis/redisClient";
import { REDIS_KEYS } from "../../../../shared/constants/redis";
import { SystemEventMessage } from "../../../../shared/types";

export class EventService {
  private repository = new JobEventRepository();

  async createEvent(
    jobId: string,
    eventType: string,
    workerId?: string,
    details?: any
  ) {
    const event = await this.repository.create(
      jobId,
      eventType,
      workerId,
      details
    );

    const message: SystemEventMessage = {
      type: eventType,
      source: "worker-service",
      timestamp: event.createdAt.toISOString(),
      jobId: jobId,
      payload: { workerId, details, id: event.id }
    };

    redisClient.publish(REDIS_KEYS.EVENTS_CHANNEL, JSON.stringify(message)).catch(err => {
      console.error("Failed to publish event to Redis:", err);
    });

    return event;
  }
}