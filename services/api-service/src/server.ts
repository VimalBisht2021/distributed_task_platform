import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { redisClient } from "./redis/client";
import { register } from "./metrics/metrics";

const PORT = process.env.PORT || 5000;

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.listen(PORT, async () => {
  console.log(`API Service running on port ${PORT}`);

  await redisClient.connect();
  console.log("Connected to Redis");
});

