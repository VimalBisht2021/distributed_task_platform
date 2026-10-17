import { redisClient } from "../redis/redisClient";
import { REDIS_KEYS } from "../redis/keys";
import { LEADER_LOCK_TTL_SECONDS } from "./leader.constants";
import { schedulerLeaderGauge } from "../metrics/metrics";
import crypto from "crypto";

export const SCHEDULER_ID = process.env.SCHEDULER_ID ?? `scheduler-${crypto.randomUUID()}`;

export class LeaderService {
    private schedulerId: string;

    constructor(schedulerId: string = SCHEDULER_ID) {
        this.schedulerId = schedulerId;
    }

    getSchedulerId(): string {
        return this.schedulerId;
    }
    
    async acquireLeadership(): Promise<boolean> {
        const result = await redisClient.set(
            REDIS_KEYS.SCHEDULER_LEADER,
            this.schedulerId,
            "EX",
            LEADER_LOCK_TTL_SECONDS,
            "NX"
        );
        
        const acquired = result === "OK";
        if (acquired) {
            schedulerLeaderGauge.set(1);
            console.log(`[${this.schedulerId}] Acquired leadership`);
        }
        return acquired;
    }

    async isLeader(): Promise<boolean> {
        const leader = await redisClient.get(
            REDIS_KEYS.SCHEDULER_LEADER
        );

        return leader === this.schedulerId;
    }

    async assertLeader(): Promise<boolean> {
        const isCurrent = await this.isLeader();
        if (!isCurrent) {
            schedulerLeaderGauge.set(0);
            return false;
        }
        return true;
    }

    async executeIfLeader<T>(action: () => Promise<T>): Promise<T | null> {
        const hasLeadership = await this.assertLeader();
        if (!hasLeadership) {
            return null;
        }
        return action();
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
            this.schedulerId,
            LEADER_LOCK_TTL_SECONDS
        );

        if (result === 0) {
            schedulerLeaderGauge.set(0);
            console.log(`[${this.schedulerId}] Leadership lost`);
            return false;
        }

        return true;
    }

    async releaseLeadership(): Promise<void> {
        const result = await redisClient.eval(
            `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
            `,
            1,
            REDIS_KEYS.SCHEDULER_LEADER,
            this.schedulerId
        );

        if (result === 1) {
            schedulerLeaderGauge.set(0);
            console.log(`[${this.schedulerId}] Leadership released`);
        }
    }
}