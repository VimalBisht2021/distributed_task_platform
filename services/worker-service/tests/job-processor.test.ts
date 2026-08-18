import { describe, it, expect, vi } from "vitest";
import { processJob } from "../src/processors/job.processor";

// We mock isolated-vm so it acts as if it failed to initialize.
vi.mock("isolated-vm", () => ({
  default: undefined
}));

describe("Job Processor - Script Handler", () => {
  it("should fail-closed if isolated-vm is not available", async () => {
    // Attempting to run a script should throw a critical error rather than mock success
    await expect(
      processJob("test-job", "core/script", { code: "console.log('hi');" })
    ).rejects.toThrow(/isolated-vm is not available in the worker environment/);
  });
});
