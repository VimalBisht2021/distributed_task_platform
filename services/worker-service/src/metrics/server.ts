import { createServer } from "http";
import { register } from "./metrics";

const PORT = process.env.METRICS_PORT || 3001;

export function startMetricsServer() {
  const server = createServer(async (req, res) => {
    if (req.url === "/metrics" && req.method === "GET") {
      res.setHeader("Content-Type", register.contentType);
      res.end(await register.metrics());
    } else {
      res.statusCode = 404;
      res.end("Not Found");
    }
  });

  server.listen(PORT, () => {
    console.log(`Worker metrics on :${PORT}`);
  });
}
