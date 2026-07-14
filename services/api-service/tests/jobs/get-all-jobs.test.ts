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

describe("GET /jobs", () => {
  it("returns all jobs for a user", async () => {
    const firstJob = await prisma.job.create({
      data: {
        userId: testUser.id,
        jobType: "EMAIL",
        payload: {},
        status: "QUEUED",
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const secondJob = await prisma.job.create({
      data: {
        userId: testUser.id,
        jobType: "PDF",
        payload: {},
        status: "COMPLETED",
      },
    });

    const response = await request(app)
      .get("/jobs")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.length).toBe(2);

    expect(response.body[0].jobId).toBe(secondJob.id);
    expect(response.body[1].jobId).toBe(firstJob.id);

    expect(response.body[0]).toHaveProperty("jobId");
    expect(response.body[0]).toHaveProperty("jobType");
    expect(response.body[0]).toHaveProperty("status");
    expect(response.body[0]).toHaveProperty("createdAt");
  });
  it("does not return another user's jobs", async () => {
    const otherUser = await prisma.user.create({
      data: {
        email: `${randomUUID()}@test.com`,
        passwordHash: "hash",
      },
    });

    await prisma.job.create({
      data: {
        userId: testUser.id,
        jobType: "EMAIL",
        payload: {},
        status: "QUEUED",
      },
    });

    await prisma.job.create({
      data: {
        userId: otherUser.id,
        jobType: "SECRET",
        payload: {},
        status: "FAILED",
      },
    });

    const response = await request(app)
      .get("/jobs")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body.length).toBe(1);
    expect(response.body[0].jobType).toBe("EMAIL");
  });
  it("returns empty array when user has no jobs", async () => {
    const response = await request(app)
      .get("/jobs")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
  it("rejects request without token", async () => {
    const response = await request(app).get("/jobs");

    expect(response.status).toBe(401);
  });
});
