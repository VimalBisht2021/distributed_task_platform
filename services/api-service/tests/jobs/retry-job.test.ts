import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
} from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { redisClient } from "../../src/redis/client";
import app from "../../src/app";
import { prisma } from "../../src/config/prisma";

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

afterEach(async () => {
  await prisma.jobEvent.deleteMany();
  await prisma.result.deleteMany();
  await prisma.job.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await redisClient.quit();
});

describe("POST /jobs/:jobId/retry",()=>{
    it("retries a failed job", async () => {
  const job = await prisma.job.create({
    data: {
      userId: testUser.id,
      jobType: "EMAIL",
      payload: {},
      status: "FAILED",
      retryCount: 0,
    },
  });

  const response = await request(app)
    .post(`/jobs/${job.id}/retry`)
    .set("Authorization", `Bearer ${token}`);

  expect(response.status).toBe(200);

  expect(response.body.jobId).toBe(job.id);
  expect(response.body.status).toBe("PENDING");
  expect(response.body.retryCount).toBe(1);

  const updatedJob = await prisma.job.findUnique({
    where: {
      id: job.id,
    },
  });

  expect(updatedJob?.status).toBe("PENDING");
  expect(updatedJob?.retryCount).toBe(1);
  expect(updatedJob?.failureReason).toBeNull();
});

it("returns error when job does not exist", async () => {
  const response = await request(app)
    .post("/jobs/non-existent-job/retry")
    .set("Authorization", `Bearer ${token}`);

  expect(response.status).toBe(400);
  expect(response.body.message).toBe("Job not found");
});
it("rejects request without token", async () => {
  const response = await request(app)
    .post("/jobs/some-id/retry");

  expect(response.status).toBe(401);
});
it("prevents retrying another user's job", async () => {
  const owner = await prisma.user.create({
    data: {
      email: `owner-${Date.now()}@test.com`,
      passwordHash: "hash",
    },
  });

  const ownerJob = await prisma.job.create({
    data: {
      userId: owner.id,
      jobType: "EMAIL",
      payload: {},
      status: "FAILED",
    },
  });

  const response = await request(app)
    .post(`/jobs/${ownerJob.id}/retry`)
    .set("Authorization", `Bearer ${token}`);

  expect(response.status).toBe(400);
  expect(response.body.message).toBe("Forbidden");

  const unchangedJob = await prisma.job.findUnique({
    where: {
      id: ownerJob.id,
    },
  });

  expect(unchangedJob?.status).toBe("FAILED");
});
it("rejects retrying a completed job", async () => {
  const job = await prisma.job.create({
    data: {
      userId: testUser.id,
      jobType: "EMAIL",
      payload: {},
      status: "COMPLETED",
    },
  });

  const response = await request(app)
    .post(`/jobs/${job.id}/retry`)
    .set("Authorization", `Bearer ${token}`);

  expect(response.status).toBe(400);

  expect(response.body.message)
    .toContain("Cannot retry job");

  const unchangedJob = await prisma.job.findUnique({
    where: {
      id: job.id,
    },
  });

  expect(unchangedJob?.status).toBe("COMPLETED");
});

it("increments retry count", async () => {
  const job = await prisma.job.create({
    data: {
      userId: testUser.id,
      jobType: "EMAIL",
      payload: {},
      status: "FAILED",
      retryCount: 3,
    },
  });

  const response = await request(app)
    .post(`/jobs/${job.id}/retry`)
    .set("Authorization", `Bearer ${token}`);

  expect(response.body.retryCount).toBe(4);
});
});