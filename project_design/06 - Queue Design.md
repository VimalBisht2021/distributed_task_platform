Queue Design

Overview

The queue acts as an intermediary layer between job producers (API Server) and job consumers (Workers).

Its primary purpose is to decouple job submission from job execution, allowing the system to process large numbers of jobs asynchronously while maintaining reliability and scalability.

---

Objectives

The queue must satisfy the following requirements:

- Reliable job storage
- Asynchronous processing
- Horizontal scalability
- Failure recovery
- Retry support
- Prevention of job loss
- Efficient worker utilization

---

High Level Architecture

```mermaid
flowchart TD

U[User]
A[API Server]
DB[(PostgreSQL)]

MQ[Main Queue]
RQ[Retry Queue]
DLQ[Dead Letter Queue]

W1[Worker 1]
W2[Worker 2]
WN[Worker N]

U --> A

A --> DB
A --> MQ

MQ --> W1
MQ --> W2
MQ --> WN

W1 --> DB
W2 --> DB
WN --> DB

W1 --> RQ
W2 --> RQ
WN --> RQ

RQ --> MQ
RQ --> DLQ

```


Queue Strategy

Pull-Based Processing

Workers pull jobs from the queue when they are ready.

Advantages

- Simplifies queue logic
- Enables horizontal scaling
- Prevents worker overload
- Naturally balances workload

Workflow

sequenceDiagram

participant Worker
participant Queue

Worker->>Queue: Request Job
Queue-->>Worker: Return job_id

---

Queue Message Format

The queue stores only:

job_id

Example:

12345

Reasoning

The database remains the single source of truth.

Benefits

- Smaller queue size
- Easier retries
- No duplicate job state
- Simplified updates

---

Job Submission Flow


```mermaid
sequenceDiagram

participant User
participant API
participant DB
participant Queue

User->>API: Submit Job

API->>DB: Create Job Record

DB-->>API: Job Created

API->>Queue: Push job_id

API-->>User: Return Job ID
```

---

Job Processing Flow

```mermaid
sequenceDiagram

participant Worker
participant Queue
participant DB

Worker->>Queue: Pull Job

Queue-->>Worker: job_id

Worker->>DB: Fetch Job

Worker->>DB: Update Status RUNNING

Worker->>DB: Store Progress

Worker->>DB: Store Result

Worker->>Queue: ACK

Queue-->>Worker: Remove Job
```

---

Reliable Delivery

The system uses acknowledgement-based processing.

Reserved / In-Flight State

When a worker pulls a job:

Job Status = Reserved

The job is temporarily hidden from other workers.

The job is removed permanently only after successful acknowledgement.

---

Worker Failure Recovery
```mermaid
flowchart TD

A[Worker Pulls Job]

B[Worker Crashes]

C[No ACK Received]

D[Lease Timeout]

E[Job Returned To Queue]

A --> B
B --> C
C --> D
D --> E
```

Retry Mechanism

Some failures are temporary:

- Network issues
- External API downtime
- Service restarts

Such jobs should be retried automatically.

---

Retry Queue

Failed jobs are moved to a retry queue.

```mermaid
flowchart LR

A[Main Queue]

B[Worker]

C[Retry Queue]

A --> B

B --> C

C --> A
```

---

Retry Policy

Attempt| Delay
Retry 1| 10 Seconds
Retry 2| 30 Seconds
Retry 3| 60 Seconds
Retry 4| 120 Seconds

Maximum Retry Count:

4

---

Dead Letter Queue (DLQ)

Jobs exceeding the retry limit are moved to a Dead Letter Queue.

Reasons

- Prevent infinite retry loops
- Preserve failure information
- Enable debugging

---

DLQ Workflow

```mermaid
flowchart LR

A[Main Queue]

B[Worker]

C[Retry Queue]

D[Dead Letter Queue]

A --> B

B --> C

C --> A

C --> D
```

---

Failure Handling Strategy

Failure Type| Action
Worker Crash| Requeue Job
Temporary API Failure| Retry
Network Failure| Retry
Invalid Input| Move To DLQ
Retry Limit Exceeded| Move To DLQ

---

Final Queue Architecture


```mermaid
flowchart TD

User

API[API Server]

DB[(PostgreSQL)]

MQ[Main Queue]

RQ[Retry Queue]

DLQ[Dead Letter Queue]

Worker[Workers]

User --> API

API --> DB

API --> MQ

Worker --> MQ

Worker --> DB

Worker --> RQ

RQ --> MQ

RQ --> DLQ
```

---

Design Decisions

1. Pull-based job retrieval.
2. Queue stores only job IDs.
3. PostgreSQL is the source of truth.
4. ACK-based message processing.
5. Reserved/In-Flight job state.
6. Retry queue with delayed retries.
7. Dead Letter Queue for permanent failures.
8. Maximum retry count of 4.
9. Horizontal worker scalability.

---

Summary

The queue acts as a reliable buffer between job producers and workers. It ensures jobs are not lost, supports retries, enables horizontal scaling, and provides fault tolerance through acknowledgement-based processing, retry queues, and dead letter queues.