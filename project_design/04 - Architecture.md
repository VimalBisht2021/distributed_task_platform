```mermaid
flowchart TD

U[User]

A[API Server]

S[Scheduler]

Q[Job Queue]

W1[Worker 1]
W2[Worker 2]
W3[Worker N]

R[Result Storage]

U --> A
A --> S
S --> Q

Q --> W1
Q --> W2
Q --> W3

W1 --> R
W2 --> R
W3 --> R

A <--> R

U <--> A
```
## Components

### API Server
- Authenticates users
- Validates requests
- Creates jobs
- Returns job IDs

### Scheduler
- Manages job assignment
- Handles retries
- Monitors workers

### Job Queue
- Stores pending jobs
- Provides durable job storage

### Workers
- Execute jobs
- Update progress
- Store results

### Result Storage
- Stores outputs
- Stores failure reasons
- Stores execution history