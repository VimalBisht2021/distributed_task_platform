import { PrismaClient } from "@prisma/client";
import { redisClient } from "../redis/redisClient";
import { REDIS_KEYS } from "../../../../shared/constants/redis";
import { SystemEventMessage } from "../../../../shared/types";

const prisma = new PrismaClient();

export class EventService {
  async createEvent(
    jobId: string,
    eventType: string,
    details?: any,
  ) {
    const event = await prisma.jobEvent.create({
      data: {
        jobId,
        eventType,
        details,
      },
    });

    const message: SystemEventMessage = {
      type: eventType,
      source: "scheduler-service",
      timestamp: event.createdAt.toISOString(),
      jobId: jobId,
      payload: { details, id: event.id }
    };

    redisClient.publish(REDIS_KEYS.EVENTS_CHANNEL, JSON.stringify(message)).catch(err => {
      console.error("Failed to publish event to Redis:", err);
    });

    return event;
  }
}