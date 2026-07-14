import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { redisClient } from "../../src/redis/client";
import { REDIS_KEYS } from "../../src/redis/keys";
import app from "../../src/app";
import { prisma } from "../../src/config/prisma";

import { beforeEach } from "vitest";

import { randomUUID } from "crypto";

beforeAll(async () => {
  await redisClient.connect();
});
let testUser: any;
let token: string;
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

describe("GET /jobs/:jobId", () => {
  it("returns a job by id", async () => {
    const job = await prisma.job.create({
      data: {
        userId: testUser.id,
        jobType: "EMAIL",
        payload: {},
        status: "QUEUED",
      },
    });

    const response = await request(app)
      .get(`/jobs/${job.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body.jobId).toBe(job.id);
    expect(response.body.status).toBe("QUEUED");
    expect(response.body.jobType).toBe("EMAIL");
  });

  it("rejects request without token", async () => {
    const response = await request(app).get("/jobs/some-id");

    expect(response.status).toBe(401);
  });
  it("prevents access to another user's job", async () => {
    const owner = await prisma.user.create({
      data: {
        email: `${randomUUID()}@test.com`,
        passwordHash: "hash",
      },
    });

    const ownerJob = await prisma.job.create({
      data: {
        userId: owner.id,
        jobType: "EMAIL",
        payload: {},
        status: "QUEUED",
      },
    });

    const response = await request(app)
      .get(`/jobs/${ownerJob.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(400);

    expect(response.body.message).toBe("Forbidden");
  });
  it("returns error when job does not exist", async () => {
    const response = await request(app)
      .get("/jobs/non-existent-job")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Job not found");
  });
});

afterEach(async () => {
  await prisma.jobEvent.deleteMany();
  await prisma.result.deleteMany();
  await prisma.job.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await redisClient.quit();
});
