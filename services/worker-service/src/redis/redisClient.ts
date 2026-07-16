import Redis from "ioredis";

// General-purpose connection for SET, GET, SADD, etc.
// Used by heartbeats, worker registration, and all non-blocking commands.
export const redisClient = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
});

// Dedicated connection for blocking operations (BRPOP).
// BRPOP with timeout 0 blocks the entire connection, so it MUST
// run on a separate client — otherwise heartbeat commands queue
// behind it and never execute, causing the worker key TTL to expire.
export const redisBlockingClient = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
});

redisClient.on("connect", () => {
  console.log("Redis connected");
});

redisBlockingClient.on("connect", () => {
  console.log("Redis blocking client connected");
});

redisClient.on("error", (err) => {
  console.error("Redis error:", err);
});

redisBlockingClient.on("error", (err) => {
  console.error("Redis blocking client error:", err);
});