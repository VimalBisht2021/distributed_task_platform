import Redis from "ioredis";

const redis = new Redis();

async function main() {
  await redis.lpush("test-queue", "hello-worker");

  const value = await redis.rpop("test-queue");

  console.log(value);

  redis.disconnect();
}

main();