import Redis from "ioredis";

// General-purpose connection for SET, GET, SADD, etc.
// Used by heartbeats, worker registration, and all non-blocking commands.
export const redisClient = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
});

// Dedicated connection originally anticipated for blocking operations (BRPOPLPUSH).
// Although we currently fall back to polling with RPOPLPUSH (to maintain strict priority queues),
// we keep this separate client to isolate the heavy queue operations from heartbeat pings.
export const redisQueueClient = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
});

redisClient.on("connect", () => {
  console.log("Redis connected");
});

redisQueueClient.on("connect", () => {
  console.log("Redis queue client connected");
});

redisClient.on("error", (err) => {
  console.error("Redis error:", err);
});

redisQueueClient.on("error", (err) => {
  console.error("Redis queue client error:", err);
});