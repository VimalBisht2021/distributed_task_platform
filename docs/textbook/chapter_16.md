# Chapter 16: Evolution of the System

Architecture is a function of scale. The perfect design for 1,000 users is an anti-pattern for 10,000,000 users. As a system grows, the bottlenecks shift. 

---

## 1. Scale 1x: The Current Architecture
*Throughput: 100,000 jobs per day (~1 RPS).*

- **Database:** Single PostgreSQL Instance.
- **Queue:** Single Redis Instance.
- **Compute:** 5 Node.js Worker Containers.
- **Status:** Perfect. The system is cheap to run, easy to reason about, and highly reliable.

---

## 2. Scale 10x: The Database Bottleneck
*Throughput: 1,000,000 jobs per day (~12 RPS).*

**How it breaks:**
The API, Workers, and Scheduler are all hammering the single PostgreSQL instance. The database CPU hits 100%.

**The Solution: Read Replicas & Connection Pooling**
We introduce **PgBouncer** (connection pooler) and spin up two **Read Replicas**. The Primary Postgres instance is now strictly reserved for `INSERT` and `UPDATE` writes, drastically dropping its CPU usage.

---

## 3. Scale 100x: The Redis Memory Limit
*Throughput: 10,000,000 jobs per day (~115 RPS).*

**How it breaks:**
Redis operates entirely in RAM. If the workers fall behind for 1 hour, Redis stores hundreds of thousands of Job IDs, runs out of memory (OOM), and crashes.

**The Solution: Redis Cluster**
We split the queue by tenant ID across 3 distinct Redis Master nodes. Worker A only connects to Redis Shard 1. By partitioning the data, we triple our available RAM.

---

## 4. Scale 1,000x: The Limits of RDBMS
*Throughput: 100,000,000 jobs per day (~1,150 RPS).*

**How it breaks:**
A single Primary PostgreSQL instance can only handle so many `UPDATE` statements per second. Writing lock-free OCC checks across millions of rows causes disk I/O bottlenecks. 

### Architecture Decision Record (ADR): Database Sharding vs NoSQL

**Problem:** The relational database cannot physically write fast enough.
**Options Considered:**
- **Option A: Database Sharding:** Split the Postgres database horizontally (Users A-M on DB 1, Users N-Z on DB 2).
- **Option B: Migrate to NoSQL (Cassandra).**

**Mental Model: Sharding a Phonebook**
> Sharding is like taking a giant phonebook and ripping it in half. A-M goes to New York, N-Z goes to London. It's much faster to search, but if you need to find all people with the same area code (a SQL `JOIN` across shards), you now have to make an expensive international phone call.

**Decision:** Option B (Cassandra).
**Why:** Sharding Postgres destroys relational integrity and makes application code insanely complex. Moving to Cassandra natively handles massive write distribution, though we lose native ACID transactions and must implement Distributed Sagas.

---

## 5. Scale 10,000x: Event-Driven Architecture
*Throughput: 1 Billion jobs per day (~11,500 RPS).*

At this scale, polling from Redis queues is wildly inefficient. We replace Redis Queues with **Apache Kafka**.

**Industry Variations:**
- **Apache Kafka:** The API appends `JOB_CREATED` events to an immutable log. Dozens of specialized microservices (Workers, Billing, Analytics) consume the log independently. 
- **Temporal.io:** Alternatively, companies like Uber use Temporal to manage massive, durable, stateful workflows, abstracting away the Kafka queues entirely.

---

## Summary

Engineering is not about building the 10,000x scale system on day one. Building an Event-Driven Kafka architecture for a system that only processes 100 jobs a day is a catastrophic waste of money. **Senior engineering is about building the exact right architecture for the current scale, while clearly understanding what must be rewritten for the next scale.**

In the final chapter, we will synthesize everything we have learned into a unified philosophy: How to Think Like a Distributed Systems Engineer.
