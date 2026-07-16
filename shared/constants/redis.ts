export const REDIS_KEYS = {
  MAIN_QUEUE: "main-queue",
  RETRY_QUEUE: "retry-queue",
  DLQ: "dead-letter-queue",
  PROCESSING_QUEUE: "processing-queue",
  SCHEDULER_LEADER: "scheduler:leader",
  EVENTS_CHANNEL: "system:events",
  // Priority queues - workers check in this order
  QUEUE_CRITICAL: "queue:critical",
  QUEUE_HIGH: "queue:high",
  QUEUE_MEDIUM: "queue:medium",
  QUEUE_LOW: "queue:low",
};

export const PRIORITY_QUEUES = [
  REDIS_KEYS.QUEUE_CRITICAL,
  REDIS_KEYS.QUEUE_HIGH,
  REDIS_KEYS.QUEUE_MEDIUM,
  REDIS_KEYS.QUEUE_LOW,
];

export function getQueueForPriority(priority: string): string {
  switch (priority) {
    case "CRITICAL": return REDIS_KEYS.QUEUE_CRITICAL;
    case "HIGH": return REDIS_KEYS.QUEUE_HIGH;
    case "LOW": return REDIS_KEYS.QUEUE_LOW;
    case "MEDIUM":
    default: return REDIS_KEYS.QUEUE_MEDIUM;
  }
}
