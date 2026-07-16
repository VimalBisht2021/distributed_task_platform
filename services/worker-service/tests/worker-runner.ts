import "../src/worker";

process.on("message", (m) => {
  if (m === "SIGTERM") {
    process.emit("SIGTERM", "SIGTERM");
  }
});
