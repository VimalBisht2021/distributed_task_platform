import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { redisClient } from "../../src/redis/client";
import { REDIS_KEYS } from "../../src/redis/keys";
import app from "../../src/app";
import { prisma } from "../../src/config/prisma";

import { beforeEach } from "vitest";

let testUser: any;
let token: string;

import { randomUUID } from "crypto";

beforeAll(async () => {
  await redisClient.connect();
});

afterAll(async () => {
  await redisClient.quit();
});

beforeEach(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `${randomUUID()}@test.com`,
      passwordHash: "fakehash",
    },
  });

  token = jwt.sign(
    {
      userId: testUser.id,
      email: testUser.email,
    },
    process.env.JWT_SECRET!,
  );
});

afterEach(async () => {
  await prisma.jobEvent.deleteMany();
  await prisma.result.deleteMany();
  await prisma.job.deleteMany();
  await prisma.user.deleteMany();
  await redisClient.del(REDIS_KEYS.QUEUE_MEDIUM);
});

describe("POST /jobs", () => {
  it("creates a job successfully", async () => {
    const response = await request(app)
      .post("/jobs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        jobType: "EMAIL",
        payload: {
          recipient: "test@test.com",
        },
      });
    const job = await prisma.job.findUnique({
      where: {
        id: response.body.jobId,
      },
    });

    expect(job).not.toBeNull();

    expect(job?.status).toBe("QUEUED");

    expect(job?.jobType).toBe("EMAIL");

    expect(job?.userId).toBe(testUser.id);

    expect(response.status).toBe(201);
    expect(response.body.jobId).toBeDefined();
    expect(response.body.status).toBe("QUEUED");
  });

  it("creates JOB_CREATED and JOB_QUEUED events", async () => {
    const response = await request(app)
      .post("/jobs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        jobType: "EMAIL",
        payload: {
          recipient: "test@test.com",
        },
      });

    const events = await prisma.jobEvent.findMany({
      where: {
        jobId: response.body.jobId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    expect(events).toHaveLength(2);

    expect(events[0].eventType).toBe("JOB_CREATED");
    expect(events[1].eventType).toBe("JOB_QUEUED");

    expect(events[0].jobId).toBe(response.body.jobId);
    expect(events[1].jobId).toBe(response.body.jobId);
  });
  it("pushes job into redis queue", async () => {
    const response = await request(app)
      .post("/jobs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        jobType: "EMAIL",
        payload: {
          recipient: "test@test.com",
        },
      });

    expect(response.status).toBe(201);

    const queue = await redisClient.lRange(REDIS_KEYS.QUEUE_MEDIUM, 0, -1);

    expect(queue).toContain(response.body.jobId);
  });
  it("rejects request without token", async () => {
    const response = await request(app)
      .post("/jobs")
      .send({
        jobType: "EMAIL",
        payload: {
          recipient: "test@test.com",
        },
      });

    expect(response.status).toBe(401);
  });
  it("rejects request with missing jobType", async () => {
    const response = await request(app)
      .post("/jobs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        payload: {
          recipient: "test@test.com",
        },
      });

    expect(response.status).toBe(400);
  });
});
