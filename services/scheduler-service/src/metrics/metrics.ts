import client from "prom-client";

export const register = new client.Registry();

client.collectDefaultMetrics({
  register,
});

export const schedulerLeaderGauge =
  new client.Gauge({
    name: "scheduler_is_leader",
    help: "Whether this scheduler instance is leader",
    registers: [register],
  });

export const deadWorkersCounter =
  new client.Counter({
    name: "dead_workers_total",
    help: "Total workers marked dead",
    registers: [register],
  });

export const queueDepthGauge =
  new client.Gauge({
    name: "queue_depth",
    help: "Current queue depth",
    registers: [register],
  });

export const activeWorkersGauge =
  new client.Gauge({
    name: "active_workers",
    help: "Current number of active workers",
    registers: [register],
  });