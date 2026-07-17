import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { prisma } from "../../src/config/prisma";
import app from "../../src/app";
import { redisClient } from "../../src/redis/client";

beforeAll(async () => {
  await redisClient.connect();
});

afterAll(async () => {
  await redisClient.quit();
});

beforeEach(async () => {
  await prisma.jobEvent.deleteMany();
  await prisma.result.deleteMany();
  await prisma.job.deleteMany();
  await prisma.user.deleteMany();
});

afterEach(async () => {
  await prisma.jobEvent.deleteMany();
  await prisma.result.deleteMany();
  await prisma.job.deleteMany();
  await prisma.user.deleteMany();
  const keys = await redisClient.keys("ratelimit:*");
  if (keys.length > 0) {
    await redisClient.del(keys);
  }
});

describe("POST /auth/register", () => {
  it("registers a new user successfully", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send({
        email: "newuser@test.com",
        password: "securepass123",
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    expect(response.body.email).toBe("newuser@test.com");
    expect(response.body.role).toBeDefined();

    // Password hash should NOT be in the response
    expect(response.body.passwordHash).toBeUndefined();
    expect(response.body.password).toBeUndefined();
  });

  it("stores a hashed password, not plaintext", async () => {
    await request(app)
      .post("/auth/register")
      .send({
        email: "hashcheck@test.com",
        password: "securepass123",
      });

    const user = await prisma.user.findUnique({
      where: { email: "hashcheck@test.com" },
    });

    expect(user).not.toBeNull();
    // The hash must NOT equal the plaintext password
    expect(user!.passwordHash).not.toBe("securepass123");
    // bcrypt hashes always start with $2b$
    expect(user!.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("rejects duplicate email registration", async () => {
    // First registration
    await request(app)
      .post("/auth/register")
      .send({
        email: "duplicate@test.com",
        password: "securepass123",
      });

    // Second registration with same email
    const response = await request(app)
      .post("/auth/register")
      .send({
        email: "duplicate@test.com",
        password: "differentpass456",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("already exists");
  });

  it("rejects registration with missing email", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send({
        password: "securepass123",
      });

    expect(response.status).toBe(400);
  });

  it("rejects registration with missing password", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send({
        email: "nopassword@test.com",
      });

    expect(response.status).toBe(400);
  });

  it("rejects registration with invalid email format", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send({
        email: "not-an-email",
        password: "securepass123",
      });

    expect(response.status).toBe(400);
  });

  it("rejects registration with password shorter than 8 characters", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send({
        email: "shortpass@test.com",
        password: "short",
      });

    expect(response.status).toBe(400);
  });
});
