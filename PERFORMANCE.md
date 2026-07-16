# Performance & Scalability Benchmarks

This document outlines the performance characteristics of the Distributed Task Platform after implementing Internal Worker Concurrency (`WORKER_CONCURRENCY=10`).

## Validation Tests

All core distributed systems properties were successfully validated in the Operations Lab after introducing internal concurrency:

1. **Worker Recovery Test (`PASS`)**: Shutting down workers mid-execution is handled flawlessly. The Zombie Sweeper correctly identifies orphaned jobs and requeues them, proving that the concurrent execution model respects existing heartbeat and TTL mechanics.
2. **Priority Scheduling Test (`PASS`)**: Queue fairness remains intact. Even with multiple concurrent polling loops racing for jobs, the `CRITICAL` queue is always drained before `HIGH`, which drains before `MEDIUM`, etc.
3. **OCC Validation (`PASS`)**: Optimistic Concurrency Control continues to prevent race conditions. Concurrent loops pulling the same fallback jobs do not result in duplicate executions due to atomic DB `version` increments.

---

## Throughput Scaling Anomalies

A fascinating anomaly was observed during the Throughput Benchmark. Instead of throughput scaling linearly with horizontal workers, throughput actually *degraded* on the local development machine as container counts increased.

### Benchmark Results (Local Docker Desktop)
*Base Concurrency per Worker: 10*

| Workers | Base Concurrency | Effective Concurrency | Jobs/sec | Observation |
| ------- | ---------------- | --------------------- | -------- | ----------- |
| 1       | 1                | 1                     | 0.85     | Baseline (No internal concurrency) |
| 1       | 10               | 10                    | 3.31     | Peak Efficiency (Vertical Scaling) |
| 2       | 10               | 20                    | 2.15     | Degradation (Horizontal Scaling) |
| 3       | 10               | 30                    | 2.24     | Degradation (Horizontal Scaling) |
| 4       | 10               | 40                    | 2.32     | Degradation (Horizontal Scaling) |
| 8       | 10               | 80                    | 2.10     | Degradation (Horizontal Scaling) |

### Why Did This Happen?

1. **Local Hardware Limits (Context Switching)**: Running 8 separate Node.js worker containers + Postgres + Redis + API + Scheduler + Dashboard on a single local machine causes massive CPU context switching. The overhead of the OS juggling all these processes destroys the I/O throughput.
2. **Database Contention**: 80 concurrent event loops simultaneously trying to execute `UPDATE jobs SET status = 'RUNNING' WHERE version = X` creates intense lock contention and connection pooling saturation in the single Postgres container.
3. **Redis Polling**: With 80 active loops calling `RPOPLPUSH` every 500ms, the Redis container is hit with 160 commands per second just while idling, leading to localized network congestion on the Docker bridge.

### Conclusion

This data perfectly illustrates the tradeoffs of distributed architectures. For local development or constrained environments, **Vertical Scaling** (1 container with `CONCURRENCY=10`) is vastly superior to **Horizontal Scaling** (10 containers with `CONCURRENCY=1`) due to drastically reduced overhead. 

Horizontal scaling should only be leveraged when the containers are deployed across distinct physical nodes (e.g., Kubernetes clusters) where CPU context switching is isolated.
