import { Router } from "express";
import { prisma } from "../config/prisma";
import { redisClient as redis } from "../redis/client";

const router = Router();

// Liveness probe (just checks if express is responding)
router.get("/live", (_req, res) => {
    return res.status(200).json({ status: "alive" });
});

// Readiness probe (checks if it can accept traffic e.g., DB connected)
router.get("/ready", async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        await redis.ping();
        return res.status(200).json({ status: "ready" });
    } catch (error) {
        return res.status(503).json({ status: "not_ready" });
    }
});

// Full healthcheck (legacy backwards compatibility)
router.get("/", async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        await redis.ping();
        return res.status(200).json({
            status: "ok",
            database: "connected",
            redis: "connected",
            service: "api-service",
        });
    } catch (error) {
        return res.status(500).json({
            status: "error",
            database: "disconnected",
            service: "api-service",
        });
    }
});

export default router;
