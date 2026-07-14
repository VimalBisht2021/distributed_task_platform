const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function processJob(jobId: string) {
  console.log(`Executing ${jobId}`);

  // Step 1
  await sleep(5000);

  // Step 2
  await sleep(5000);

  // Step 3
  await sleep(5000);

  // Step 4
  await sleep(5000);

  // Step 5
  await sleep(5000);

  return {
    resultType: "TEXT",
    content: `Job ${jobId} completed successfully`,
  };
}