require("../dist/services/worker-service/src/worker.js");

process.on("message", (m) => {
  if (m === "SIGTERM") {
    process.emit("SIGTERM", "SIGTERM");
    if (process.disconnect) {
      process.disconnect();
    }
  }
});
