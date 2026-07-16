import Redis from "ioredis";
import { getQueueForPriority } from "../../../../shared/constants/redis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

export class QueueService{
    async enqueue(jobId: string, priority: string = "MEDIUM"){
        const queue = getQueueForPriority(priority);
        await redis.lpush(queue, jobId);
    }
}
