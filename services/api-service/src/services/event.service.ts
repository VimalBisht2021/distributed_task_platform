import { JobEventRepository } from "../repositories/job-event.repository";
import { redisClient, redisBlockingClient } from "../redis/client";
import { REDIS_KEYS } from "../../../../shared/constants/redis";
import { SystemEventMessage } from "../../../../shared/types";
import { EventEmitter } from "events";

const sseEmitter = new EventEmitter();
sseEmitter.setMaxListeners(100);

// Initialize single Redis subscriber for SSE
const subClient = redisBlockingClient.duplicate();

async function initSubscriber() {
  console.log("[SSE DEBUG] initSubscriber called");
  try {
    if (!subClient.isOpen) {
      console.log("[SSE DEBUG] subClient connecting...");
      await subClient.connect();
      console.log("[SSE DEBUG] subClient connected!");
    }
    await subClient.subscribe(REDIS_KEYS.EVENTS_CHANNEL, (message, channel) => {
      console.log(`[SSE DEBUG] Received message from redis on ${channel}: ${message}`);
      try {
        const parsed = JSON.parse(message);
        sseEmitter.emit("newEvent", parsed);
        console.log(`[SSE DEBUG] Emitted newEvent to ${sseEmitter.listenerCount("newEvent")} listeners`);
      } catch (e) {
        console.error("Failed to parse event message", e);
      }
    });
  } catch (err) {
    console.error("Failed to subscribe to events channel:", err);
  }
}

initSubscriber();

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
      source: "api-service",
      timestamp: event.createdAt.toISOString(),
      jobId: jobId,
      payload: { workerId, details, id: event.id }
    };

    redisClient.publish(REDIS_KEYS.EVENTS_CHANNEL, JSON.stringify(message)).catch(err => {
      console.error("Failed to publish event to Redis:", err);
    });

    return event;
  }

  async findByJobId(jobId: string) {
    return this.repository.findByJobId(jobId);
  }

  async getRecentRecoveryEvents(limit: number = 50) {
    return this.repository.getRecentRecoveryEvents(limit);
  }

  subscribeToEvents(callback: (event: SystemEventMessage) => void) {
    sseEmitter.on("newEvent", callback);
    return () => {
      sseEmitter.off("newEvent", callback);
    };
  }
}