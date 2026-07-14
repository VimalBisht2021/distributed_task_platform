import { redisClient } from "../redis/redisClient";
import { REDIS_KEYS } from "../redis/keys";
import { LEADER_LOCK_TTL_SECONDS } from "./leader.constants";
import { schedulerLeaderGauge } from "../metrics/metrics";
import crypto from "crypto";

export const SCHEDULER_ID = process.env.SCHEDULER_ID ?? `scheduler-${crypto.randomUUID()}`;

export class LeaderService {
    
    async acquireLeadership(): Promise<boolean> {
        const result = await redisClient.set(
            REDIS_KEYS.SCHEDULER_LEADER,
            SCHEDULER_ID,
            "EX",
            LEADER_LOCK_TTL_SECONDS,
            "NX"
        );
        
        const acquired = result === "OK";
        if (acquired) {
            schedulerLeaderGauge.set(1);
            console.log(`[${SCHEDULER_ID}] Acquired leadership`);
        }
        return acquired;
    }

    async isLeader(): Promise<boolean> {
        const leader = await redisClient.get(
            REDIS_KEYS.SCHEDULER_LEADER
        );

        return leader === SCHEDULER_ID;
    }

    async renewLeadership(): Promise<boolean> {
        const result = await redisClient.eval(
            `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("expire", KEYS[1], ARGV[2])
            else
                return 0
            end
            `,
            1,
            REDIS_KEYS.SCHEDULER_LEADER,
            SCHEDULER_ID,
            LEADER_LOCK_TTL_SECONDS
        );

        if (result === 0) {
            schedulerLeaderGauge.set(0);
            console.log(`[${SCHEDULER_ID}] Leadership lost`);
            return false;
        }

        return true;
    }
}