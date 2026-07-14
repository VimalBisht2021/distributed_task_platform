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

  // Seed a user via the register endpoint so we have a real bcrypt hash
  await request(app)
    .post("/auth/register")
    .send({
      email: "login@test.com",
      password: "correctpassword",
    });
});

afterEach(async () => {
  await prisma.jobEvent.deleteMany();
  await prisma.result.deleteMany();
  await prisma.job.deleteMany();
  await prisma.user.deleteMany();
});

describe("POST /auth/login", () => {
  it("returns a JWT token with correct credentials", async () => {
    const response = await request(app)
      .post("/auth/login")
      .send({
        email: "login@test.com",
        password: "correctpassword",
      });

    expect(response.status).toBe(200);
    // The response body should be a JWT string (3 dot-separated base64 segments)
    expect(response.body).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it("rejects login with wrong password", async () => {
    const response = await request(app)
      .post("/auth/login")
      .send({
        email: "login@test.com",
        password: "wrongpassword",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("Invalid credentials");
  });

  it("rejects login for non-existent user", async () => {
    const response = await request(app)
      .post("/auth/login")
      .send({
        email: "nobody@test.com",
        password: "anypassword",
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("Invalid credentials");
  });

  it("rejects login with missing email", async () => {
    const response = await request(app)
      .post("/auth/login")
      .send({
        password: "correctpassword",
      });

    expect(response.status).toBe(400);
  });

  it("rejects login with missing password", async () => {
    const response = await request(app)
      .post("/auth/login")
      .send({
        email: "login@test.com",
      });

    expect(response.status).toBe(400);
  });
});
