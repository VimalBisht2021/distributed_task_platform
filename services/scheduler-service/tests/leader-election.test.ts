import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LeaderService, SCHEDULER_ID } from "../src/leader-election/leader.service";
import { redisClient } from "../src/redis/redisClient";
import { REDIS_KEYS } from "../src/redis/keys";

describe("Scheduler Leader Election", () => {
  const leaderService = new LeaderService();

  beforeEach(async () => {
    await redisClient.del(REDIS_KEYS.SCHEDULER_LEADER);
  });

  afterEach(async () => {
    await redisClient.del(REDIS_KEYS.SCHEDULER_LEADER);
  });

  it("should successfully acquire leadership if no leader exists", async () => {
    const acquired = await leaderService.acquireLeadership();
    expect(acquired).toBe(true);

    const currentLeader = await redisClient.get(REDIS_KEYS.SCHEDULER_LEADER);
    expect(currentLeader).toBe(SCHEDULER_ID);

    const isLeader = await leaderService.isLeader();
    expect(isLeader).toBe(true);
  });

  it("should fail to acquire leadership if another scheduler holds the lock", async () => {
    // Simulate Scheduler 2 taking the lock first
    await redisClient.set(REDIS_KEYS.SCHEDULER_LEADER, "other-scheduler-id", "EX", 10, "NX");

    // Scheduler 1 attempts
    const acquired = await leaderService.acquireLeadership();
    expect(acquired).toBe(false);

    const isLeader = await leaderService.isLeader();
    expect(isLeader).toBe(false);
  });

  it("should renew leadership if it currently holds the lock", async () => {
    // Acquire initially
    await leaderService.acquireLeadership();
    expect(await leaderService.isLeader()).toBe(true);

    // Renew it
    const renewed = await leaderService.renewLeadership();
    expect(renewed).toBe(true);

    // Assert it still holds it
    const currentLeader = await redisClient.get(REDIS_KEYS.SCHEDULER_LEADER);
    expect(currentLeader).toBe(SCHEDULER_ID);
  });

  it("should fail to renew leadership if the lock expired or was taken", async () => {
    // Simulate Scheduler 2 somehow stealing the lock or lock expiring and being grabbed
    await redisClient.set(REDIS_KEYS.SCHEDULER_LEADER, "other-scheduler-id");

    // Scheduler 1 tries to renew its own lock
    const renewed = await leaderService.renewLeadership();
    
    // The Lua script should reject the renewal because the value doesn't match SCHEDULER_ID
    expect(renewed).toBe(false);
  });

  it("should be able to acquire lock after previous leader expires/deleted", async () => {
    // Scheduler 2 holds the lock
    await redisClient.set(REDIS_KEYS.SCHEDULER_LEADER, "other-scheduler-id");
    
    expect(await leaderService.acquireLeadership()).toBe(false);

    // Simulate lock expiration/deletion
    await redisClient.del(REDIS_KEYS.SCHEDULER_LEADER);

    // Scheduler 1 should now be able to acquire it
    const acquired = await leaderService.acquireLeadership();
    expect(acquired).toBe(true);
  });
});
