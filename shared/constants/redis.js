"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRIORITY_QUEUES = exports.REDIS_KEYS = void 0;
exports.getQueueForPriority = getQueueForPriority;
exports.REDIS_KEYS = {
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
exports.PRIORITY_QUEUES = [
    exports.REDIS_KEYS.QUEUE_CRITICAL,
    exports.REDIS_KEYS.QUEUE_HIGH,
    exports.REDIS_KEYS.QUEUE_MEDIUM,
    exports.REDIS_KEYS.QUEUE_LOW,
];
function getQueueForPriority(priority) {
    switch (priority) {
        case "CRITICAL": return exports.REDIS_KEYS.QUEUE_CRITICAL;
        case "HIGH": return exports.REDIS_KEYS.QUEUE_HIGH;
        case "LOW": return exports.REDIS_KEYS.QUEUE_LOW;
        case "MEDIUM":
        default: return exports.REDIS_KEYS.QUEUE_MEDIUM;
    }
}
