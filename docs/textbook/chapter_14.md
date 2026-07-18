# Chapter 14: Testing Distributed Systems

Writing a unit test to verify that `add(2, 2) === 4` is easy. 
Writing a test to verify that "If a worker crashes exactly 3 milliseconds after reading from Redis but before writing to Postgres, the job is not permanently lost," is incredibly difficult.

In monolithic applications, tests are deterministic. In distributed systems, tests are plagued by network latency, race conditions, and clock skew. 

---

## 1. The Hierarchy of Tests

### Unit Tests
Tests a single isolated function. All external dependencies (Database, Redis, Network) are "mocked."
- **Flaw:** In a distributed system, unit tests provide a false sense of security. The majority of bugs occur at the *boundaries* between services, not within the business logic itself.

### Integration Tests
Tests multiple components working together.
- **📍 Our Project:** Our integration tests spin up a *real* PostgreSQL database and a *real* Redis instance (using Docker Testcontainers). We test that the Worker successfully pulls from Redis and updates Postgres. No mocks allowed.

---

## 2. Race Testing & Concurrency Testing

How do you test Optimistic Concurrency Control (OCC)?
You must programmatically force a race condition.

**Interview & Design Discussion:** *"How do you prove your OCC logic actually works?"*
**Expected Discussion:**
"You cannot test OCC sequentially. You must write a script that spawns Thread A and Thread B. Both threads read Job 123 (`version = 1`) simultaneously. Then, you force both threads to execute their `UPDATE... WHERE version = 1` statement at the exact same millisecond. Finally, you assert that exactly one thread returns a success (1 row updated) and one thread catches an OCC error (0 rows updated)."

---

## Architecture Decision Record (ADR): Chaos Engineering

### Problem
We need to prove our system recovers from catastrophic worker crashes.

### Options Considered
- **Option A: Manual Testing:** An engineer types `docker kill` in the terminal and watches the logs.
- **Option B: Simulated Failures:** We write mock code that forces the worker to pretend to crash.
- **Option C: Docker-out-of-Docker (DooD):** We give our web dashboard physical control over the host's Docker Daemon to literally murder the containers.

### Decision
We chose **Option C (DooD Chaos Engineering)**.

### Why this decision?
Simulated failures (Option B) are inherently biased because they test the code you wrote against the assumptions you made. Chaos Engineering proves the system survives *physical reality*. 

### What can go wrong?
If you deploy a Chaos Engineering tool (like Netflix's Chaos Monkey) to Production, and your recovery mechanisms fail, your testing tool just caused a massive, company-wide outage. Chaos Engineering requires immense maturity and robust Circuit Breakers.

### 📍 Our Project: The Zombie Recovery Scenario
When you click "Execute Recovery Test" in our Operations Lab, the `lab-service` orchestrates the following:
1. Injects 5 long-running jobs.
2. Executes a shell command against the Docker Daemon: `docker compose kill worker-service`. 
3. Asserts that within 45 seconds, the Scheduler detects the missing heartbeats and requeues the jobs to `PENDING`.
4. Executes `docker compose up -d worker-service` to bring the workers back to life.
5. Asserts that the new workers pull the requeued jobs and complete them successfully.

This is not a mock. This is a physical, deterministic execution of a distributed systems failure. 

---

## Summary

Testing a distributed system requires abandoning the assumption that the network is reliable. By integrating Chaos Engineering, we shifted from hoping our architecture works to scientifically proving it.

In Chapter 15, we will discuss Production Readiness—how systems are deployed using Docker, Kubernetes, and automated CI/CD pipelines.
