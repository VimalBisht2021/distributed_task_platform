import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { prisma } from "../../src/config/prisma";
import app from "../../src/app";
import { redisClient } from "../../src/redis/client";

let validToken: string;

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

  // Register a user
  await request(app)
    .post("/auth/register")
    .send({
      email: "jwt@test.com",
      password: "securepass123",
    });

  // Login to get a real token
  const loginResponse = await request(app)
    .post("/auth/login")
    .send({
      email: "jwt@test.com",
      password: "securepass123",
    });

  validToken = loginResponse.body;
});

afterEach(async () => {
  await prisma.jobEvent.deleteMany();
  await prisma.result.deleteMany();
  await prisma.job.deleteMany();
  await prisma.user.deleteMany();
});

describe("JWT Token Validation", () => {
  it("token contains correct user claims", () => {
    const decoded = jwt.verify(validToken, process.env.JWT_SECRET!) as any;

    expect(decoded.userId).toBeDefined();
    expect(decoded.email).toBe("jwt@test.com");
    expect(decoded.role).toBeDefined();
    expect(decoded.exp).toBeDefined();
  });

  it("GET /auth/me accepts valid token", async () => {
    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${validToken}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toBeDefined();
    expect(response.body.user.email).toBe("jwt@test.com");
    expect(response.body.user.userId).toBeDefined();
  });

  it("GET /auth/me rejects request without token", async () => {
    const response = await request(app)
      .get("/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("No token provided");
  });

  it("GET /auth/me rejects malformed authorization header", async () => {
    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", "NotBearer sometoken");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid authorization header");
  });

  it("GET /auth/me rejects invalid/tampered token", async () => {
    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer invalid.token.here");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid token");
  });

  it("GET /auth/me rejects token signed with wrong secret", async () => {
    const fakeToken = jwt.sign(
      { userId: "fake-id", email: "fake@test.com" },
      "completely-wrong-secret",
    );

    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${fakeToken}`);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid token");
  });

  it("full auth flow: register → login → access protected route", async () => {
    // Register a fresh user
    const regResponse = await request(app)
      .post("/auth/register")
      .send({
        email: "fullflow@test.com",
        password: "mypassword123",
      });

    expect(regResponse.status).toBe(201);

    // Login
    const loginResponse = await request(app)
      .post("/auth/login")
      .send({
        email: "fullflow@test.com",
        password: "mypassword123",
      });

    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body;

    // Access protected route
    const meResponse = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.email).toBe("fullflow@test.com");
  });
});
