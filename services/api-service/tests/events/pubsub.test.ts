import { EventService } from "../../src/services/event.service";
import { redisClient } from "../../src/redis/client";
import { REDIS_KEYS } from "../../../../shared/constants/redis";
import { SystemEventMessage } from "../../../../shared/types";
import { describe, it, beforeAll, afterAll, expect } from "vitest";

describe("Pub/Sub Integration", () => {
  let eventService: EventService;

  beforeAll(async () => {
    eventService = new EventService();
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  });

  afterAll(async () => {
    await redisClient.quit();
  });

  it("should receive events published to Redis", async () => {
    console.log("REDIS_KEYS:", REDIS_KEYS);

    const testEvent: SystemEventMessage = {
      type: "TEST_EVENT",
      source: "test-suite",
      timestamp: new Date().toISOString(),
      jobId: "job-123",
      payload: { id: "test-id" }
    };

    const promise = new Promise<void>((resolve, reject) => {
      const unsubscribe = eventService.subscribeToEvents((event) => {
        try {
          if (event.type === "TEST_EVENT" && event.jobId === "job-123") {
            expect(event.source).toBe("test-suite");
            expect(event.payload.id).toBe("test-id");
            unsubscribe();
            resolve();
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    // Publish event
    await redisClient.publish(REDIS_KEYS.EVENTS_CHANNEL || "system:events", JSON.stringify(testEvent));
    await promise;
  });
});
