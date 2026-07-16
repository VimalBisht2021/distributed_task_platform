import { createServer } from "http";
import { register } from "./metrics";

const PORT = process.env.METRICS_PORT || 3003;

let metricsServer: ReturnType<typeof createServer> | null = null;

export function startMetricsServer() {
  metricsServer = createServer(async (req, res) => {
    if (req.url === "/metrics" && req.method === "GET") {
      res.setHeader("Content-Type", register.contentType);
      res.end(await register.metrics());
    } else {
      res.statusCode = 404;
      res.end("Not Found");
    }
  });

  metricsServer.listen(PORT, () => {
    console.log(`Worker metrics on :${PORT}`);
  });
}

export function stopMetricsServer(): Promise<void> {
  return new Promise((resolve) => {
    if (metricsServer) {
      metricsServer.close(() => {
        metricsServer = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}
