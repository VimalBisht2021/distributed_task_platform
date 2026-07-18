# Chapter 9: Distributed Systems Patterns

Patterns are standardized, battle-tested solutions to recurring architectural problems. When senior engineers design systems, they do not invent new ways to solve old problems; they apply patterns. 

---

## 1. Producer-Consumer & Competing Consumers
- **The Problem:** A single Consumer isn't fast enough to drain the queue.
- **The Solution:** Spin up multiple Consumers all listening to the exact same queue. 
- **📍 Our Project:** By running `docker compose scale worker-service=5`, we create 5 Competing Consumers. Redis guarantees that an `RPOPLPUSH` from Worker A will never pop the same job as Worker B.

## 2. Leader Election
- **The Problem:** You have 5 identical Scheduler nodes, but you need exactly *one* node to sweep the database for dead jobs to avoid conflicts.
- **The Solution:** The nodes race to acquire a distributed lock. The winner becomes the Leader. If the Leader dies, a Follower takes over.
- **📍 Our Project:** Our `scheduler-service` uses Redis `SETNX` (Set if Not eXists) to elect a leader. 

## 3. Bulkhead Pattern

**Mental Model: Submarines**
> If a submarine's hull is breached, the entire submarine sinks. To prevent this, subs are built with watertight compartments (Bulkheads). If one compartment floods, you seal the doors. The sub stays afloat.

- **The Problem:** In software, a failure in one subsystem drains resources from another.
- **The Solution:** We use strict Priority Queues. If a user submits 1,000,000 broken jobs that constantly fail, they clog the `queue:low` bulkhead. However, because our workers strictly process `queue:critical` first, critical system jobs remain entirely unaffected.

## 4. Circuit Breaker

- **The Problem:** Your worker calls the Stripe API. Stripe goes down. If you have 10,000 jobs calling Stripe, your workers will hang for 30 seconds waiting for timeouts, exhausting all your CPU/RAM.

```mermaid
stateDiagram-v2
    [*] --> CLOSED: System Healthy
    CLOSED --> OPEN: 5 Timeouts Detected
    
    state OPEN {
        Note: Fail instantly.<br>Do not make network call.
    }
    
    OPEN --> HALF_OPEN: Wait 60 seconds
    
    state HALF_OPEN {
        Note: Allow 1 test request.
    }
    
    HALF_OPEN --> CLOSED: Test Succeeds!
    HALF_OPEN --> OPEN: Test Fails!
```
*(Netflix popularized this pattern with their library Hystrix).*

## 5. The Saga Pattern (Distributed Transactions)
- **The Problem:** You need to book a Flight, Hotel, and Car. You need all three to succeed or fail. But they are managed by 3 separate microservices with 3 separate databases. You cannot use a SQL `BEGIN/COMMIT`.
- **The Solution:** A Saga. Service A books the flight and publishes an event. Service B hears the event and books the hotel. If Service C tries to book the car and fails, Service A and B execute *Compensating Transactions* (canceling the flight and hotel).

## 6. Outbox Pattern
- **The Problem:** A worker finishes a job, saves the result to Postgres, and wants to publish a `JOB_COMPLETED` event to Kafka. What if the Postgres save succeeds, but the Kafka publish fails due to a network glitch? The system is permanently out of sync.
- **The Solution:** The worker saves the event *into the same Postgres database* in a table called `Outbox`, inside the exact same SQL transaction. A separate relay process reads the `Outbox` table and safely pushes the events to Kafka.
- **📍 Our Project (Lessons Learned):** We skipped the Outbox pattern for simplicity, choosing to publish to Redis Pub/Sub directly after committing to Postgres. If I were designing this again for an enterprise client, I would implement the Outbox pattern. Currently, if our Redis publish fails, our SSE UI misses the event permanently.

---

## Interview & Design Discussion

**Interview Question:** *"What happens if the Outbox relay process crashes while reading from the Outbox table and publishing to Kafka?"*

**Expected Discussion:**
- **Senior:** "When the relay process restarts, it won't know if the last event was successfully published to Kafka or not. Therefore, the relay process must use At-Least-Once delivery. It will likely republish the same event to Kafka again. This is why downstream consumers of Kafka *must* be idempotent."

---

## Summary
Understanding patterns allows you to communicate complex architectures in a single sentence. Saying "We use Competing Consumers with a Heartbeat-driven Leader Election" instantly tells a senior engineer exactly how your system is architected.

In the next chapter, we will shift from macro-architecture to micro-mechanics, exploring the specific Computer Science foundations that power these patterns.
