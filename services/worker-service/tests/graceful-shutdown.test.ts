import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { redisClient } from "../src/redis/redisClient";
import { REDIS_KEYS } from "../src/redis/keys";
import { execSync, fork } from "child_process";
import path from "path";

const prisma = new PrismaClient();

describe("Worker Graceful Shutdown Integration", () => {
  beforeAll(async () => {
    // Clear out main-queue
    await redisClient.del(REDIS_KEYS.MAIN_QUEUE);
    await redisClient.del(REDIS_KEYS.PROCESSING_QUEUE);
    
    // Ensure the worker is compiled to JS before testing
    execSync("npm run build", { cwd: path.resolve(__dirname, "..") });
  }, 30000);

  afterAll(async () => {
    await prisma.$disconnect();
    await redisClient.quit();
  });

  it("should wait for the current job to finish before exiting on SIGTERM", async () => {
    const job = await prisma.job.create({
      data: {
        jobType: "video-encode",
        payload: { file: "test.mp4" },
        user: {
          connectOrCreate: {
            where: { email: "test@example.com" },
            create: { email: "test@example.com", passwordHash: "dummy" },
          }
        }
      },
    });

    await redisClient.lpush(REDIS_KEYS.MAIN_QUEUE, job.id);

    // 2. Spawn the worker process using fork to enable IPC
    const workerProcess = fork(path.resolve(__dirname, "worker-runner.js"), {
      cwd: path.resolve(__dirname, ".."),
      env: {
        ...process.env,
        TEST_PROCESSOR_DELAY: "100", // Makes processor take 500ms total
        WORKER_ID: "worker-shutdown-test",
        NODE_ENV: "development",
      },
      stdio: "pipe"
    });

    // We'll collect stdout to verify shutdown happens properly
    let output = "";
    workerProcess.stdout?.on("data", (data) => {
      const str = data.toString();
      output += str;
    });

    // Wait for the worker to pick up the job
    await new Promise((resolve) => {
      const checkInterval = setInterval(async () => {
        const freshJob = await prisma.job.findUnique({ where: { id: job.id } });
        if (freshJob && freshJob.status === "RUNNING") {
          clearInterval(checkInterval);
          resolve(true);
        }
      }, 100);
    });

    // 3. Send SIGTERM via IPC message (works across all platforms safely)
    workerProcess.send("SIGTERM");

    // 4. Wait for process to exit
    const exitCode = await new Promise<number | null>((resolve) => {
      const timeout = setTimeout(() => {
        console.error("Worker process stdout:", output);
        resolve(null);
      }, 5000);

      workerProcess.on("exit", (code) => {
        clearTimeout(timeout);
        resolve(code);
      });
    });

    console.log("Worker stdout:", output);

    // 5. Assertions
    expect(exitCode).toBe(0); // Exited cleanly

    const finishedJob = await prisma.job.findUnique({ where: { id: job.id } });
    expect(finishedJob?.status).toBe("COMPLETED");

    const result = await prisma.result.findUnique({ where: { jobId: job.id } });
    expect(result).toBeDefined();

    // Verify worker was removed
    const activeWorkers = await redisClient.smembers(REDIS_KEYS.ACTIVE_WORKERS);
    expect(activeWorkers).not.toContain("worker-shutdown-test");

    const heartbeatKey = await redisClient.get(`worker:worker-shutdown-test`);
    expect(heartbeatKey).toBeNull();
    
    // Check logs to ensure graceful sequence happened
    expect(output).toContain("Shutting down worker...");
    expect(output).toMatch(/Waiting for \d+ current jobs? to finish\.\.\./);
    expect(output).toContain("Worker shutdown complete");
  }, 10000); // 10s timeout should be plenty for a 1s delay
});
