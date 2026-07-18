# Chapter 5: Database & State Management

In a distributed system, servers are ephemeral. Worker nodes crash, Redis instances restart, and network connections drop. The only thing that truly matters is the **Source of Truth**—the system that reliably remembers what actually happened.

---

## 1. Why Do We Need a Database?

If we already have Redis acting as our queue, why do we need a separate database?

Redis is optimized for raw speed. It stores data in memory (RAM). While Redis can periodically flush to disk, it is fundamentally designed as a volatile cache and message broker. We need a system designed for **Durability** above all else. We need a database that guarantees that once it confirms a write, that data will survive a catastrophic hardware failure.

### Evolution Timeline of State Management
- **1980s (Flat Files):** Writing state to text files. Highly susceptible to corruption if two processes wrote at once.
- **1990s (SQL Databases):** Oracle and MySQL introduced ACID compliance, solving corruption via rigid schemas and locks.
- **2010s (NoSQL):** MongoDB and Cassandra dropped ACID guarantees to achieve massive horizontal scalability for the web.
- **2020s (NewSQL):** CockroachDB and Google Spanner use atomic clocks to offer both strict ACID compliance *and* massive horizontal scalability.

---

## Architecture Decision Record (ADR): The Database Engine

### Problem
We need to store the complex state lifecycle of millions of background jobs.

### Options Considered
- **Option A: MongoDB (NoSQL):** "Schema-less" flexibility. Massive horizontal scaling.
- **Option B: PostgreSQL (SQL):** Strict schemas, relational integrity, ACID compliance.

### Decision
We chose **Option B (PostgreSQL)**.

### Why this decision?
A background task platform is a massive **State Machine**. A job moves rigidly from `PENDING` -> `QUEUED` -> `RUNNING` -> `COMPLETED`. 
State machines require absolute strictness. PostgreSQL's rigid schemas (via Prisma ORM), strict Enum types for job statuses, and robust ACID guarantees ensure that our state transitions are flawless. 

### Why not MongoDB?
MongoDB's lack of schema enforcement means a buggy worker could change a job status from `"COMPLETED"` to `{ status: "COMPLETED" }`. MongoDB will happily save it, instantly crashing the dashboard that expects a string. Furthermore, many NoSQL databases use *Eventual Consistency*, meaning Worker B might read stale data immediately after Worker A updates it. We cannot tolerate that for task execution.

---

## 2. Designing the Schema (Event Sourcing)

We don't just store the current state of a job; we store its history.

### The `JobEvent` Table
Every time a job changes state, we append a new row to the `JobEvent` table.
If a job fails, the user needs to know *why*. By storing an append-only log of events (e.g., "Worker-1 picked up job", "Worker-1 failed: API timeout"), we create a complete audit trail.

**Mental Model: Bank Accounts**
> In modern banking (Event Sourcing), your balance is not stored as a single number (`$500`). It is calculated by summing an append-only log of every transaction you've ever made (`+$1000`, `-$500`). This makes the system perfectly auditable.

---

## 3. The State Machine Lifecycle

**Mental Model: A Board Game**
> In Chess, a Knight can only move in an L-shape. Moving diagonally is an illegal transition. State Machines apply these rigid rules to data.

**Legal Transitions:**
- `PENDING` -> `QUEUED` 
- `QUEUED` -> `RUNNING` 
- `RUNNING` -> `COMPLETED` 

**Illegal Transitions:**
- `COMPLETED` -> `RUNNING` (A finished job cannot be restarted accidentally).

By enforcing these transitions logically in our code and relying on Postgres to safely commit them, we build a deterministic system.

---

## Interview & Design Discussion

**Interview Question:** *"If we use PostgreSQL, what happens if our daily jobs grow from 100,000 to 100 Million? Won't the database crash?"*

**Expected Discussion:**
- **Junior:** "We would migrate to NoSQL like Cassandra."
- **Senior:** "Before rewriting the entire persistence layer, we would scale Postgres. We would add PgBouncer for connection pooling. We would spin up Read Replicas and route all Dashboard `SELECT` queries to the replicas, leaving the Primary database strictly for Worker `UPDATE`s. Only when write-throughput exceeds the largest AWS RDS instance would we consider Database Sharding or NoSQL."

---

## Summary

PostgreSQL serves as the unshakeable foundation of our platform. However, having a reliable database is not enough if the workers interacting with it are flawed. What happens if a network glitch causes two workers to think they own the exact same job, and both try to update Postgres at the exact same millisecond?

In Chapter 6, we will dive into Optimistic Concurrency Control (OCC).
