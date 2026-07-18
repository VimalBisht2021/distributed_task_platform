# Appendix: Glossary of Distributed Systems Terms

This appendix serves as a quick reference for the core concepts, algorithms, and infrastructure terminology used throughout the textbook.

---

### ACID
An acronym defining the properties of a reliable database transaction: Atomicity, Consistency, Isolation, Durability.

### Asynchronous Execution
A computing model where a process requests an action to be performed but does not wait for it to finish.

### C10K Problem
The historic challenge of optimizing network sockets to handle 10,000 concurrent connections, leading to the rise of Event Loop models (Node.js).

### CAP Theorem
A theorem stating a distributed data store can only guarantee two of the following three: Consistency, Availability, Partition Tolerance. (Due to physical reality, Partition Tolerance is mandatory, forcing a choice between CP and AP).

### Chaos Engineering
The discipline of intentionally injecting failures into a production-like system to uncover hidden vulnerabilities.

### Circuit Breaker
A design pattern that prevents cascading failures by "tripping" and instantly failing requests when a downstream service is struggling.

### Distributed Tracing
A method used to profile applications built using microservices using a unique `trace_id` passed along network boundaries.

### Eventual Consistency
A consistency model where, if no new updates are made, eventually all reads will return the last updated value (sacrificing immediate consistency for high availability).

### Exponential Backoff with Jitter
An algorithm that multiplicatively decreases the retry rate of a process, adding a random variance (Jitter) to prevent the Thundering Herd problem.

### Graceful Shutdown
The process where a server intercepts a `SIGTERM` signal, finishes active requests, and exits safely without corrupting data.

### Idempotency
A mathematical property where an operation can be applied multiple times without changing the result beyond the initial application.

### Optimistic Concurrency Control (OCC)
A lock-free concurrency algorithm using a `version` integer to detect if a record was modified by another process before saving.

### Saga Pattern
A sequence of local transactions used to maintain data consistency across multiple microservices via Compensating Transactions.

### Split-Brain
A state where a network partition causes two groups of nodes to lose contact with each other, potentially causing two Leaders to issue conflicting commands.

### Zero Trust Architecture
A security model that assumes the internal network is already compromised, requiring every microservice to authenticate and authorize every request.
