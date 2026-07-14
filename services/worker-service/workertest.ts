import { waitForJob } from "./src/queue/consumer";

async function main() {
  console.log("Waiting for job...");

  const jobId = await waitForJob();

  console.log("Received:", jobId);
}

main();
