import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

export class QueueService{
    async enqueue(jobId:string){
        await redis.lpush("main-queue", jobId);
    }
    
}


