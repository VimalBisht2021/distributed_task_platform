# Chapter 12: Security

A distributed system is only as secure as its weakest endpoint. Unlike monolithic architectures where everything is protected behind a single firewall, distributed systems have massive internal surface areas. APIs talk to queues, workers talk to databases, and schedulers talk to caches. 

---

## Architecture Decision Record (ADR): Authentication

### Problem
We need to verify user identities across multiple API servers sitting behind a Load Balancer.

### Options Considered
- **Option A: Session Cookies + DB:** Store a Session ID in a cookie. Every API request requires a DB lookup to verify the session.
- **Option B: Session Cookies + Redis:** Store the Session ID in a centralized Redis cache.
- **Option C: JSON Web Tokens (JWT):** The server cryptographically signs a token containing the user's ID and sends it to the client.

### Decision
We chose **Option C (JWT)**.

### Why this decision?
In a distributed system, relying on the Database for every single API request (Option A) adds massive latency and load. Option B is great, but requires managing another Redis instance. By using JWTs, our API instances are completely *stateless*. Any API instance can mathematically verify the signature of the token (`HMAC SHA256`) using a shared `JWT_SECRET` without ever talking to the DB or Redis.

---

## 1. Multi-Tenant Isolation (AuthZ)

A "tenant" is a customer of the platform. If User A logs in, they must absolutely never be able to see a job submitted by User B. 

Every row in our `Job` table contains a `userId` column. When a user calls `GET /api/jobs`, the `api-service` does not run `SELECT * FROM jobs`. It extracts the `userId` from the verified JWT and runs:
```sql
SELECT * FROM jobs WHERE "userId" = 'extracted-jwt-user-id';
```

### Interview & Design Discussion
**Interview Question:** *"A malicious user changes their browser URL from `/job/10` to `/job/11` and successfully views another customer's data. What is this attack, and how do we prevent it?"*

**Expected Discussion:**
This is an **Insecure Direct Object Reference (IDOR)** attack. It happens when Authorization is bypassed. 
To prevent it, we must *never* trust the client. The database query for fetching a specific job must *always* include the user's ID as a composite constraint:
`SELECT * FROM jobs WHERE id = 11 AND "userId" = 'user-id-from-jwt'`. If it returns null, we return a 404 or 403.

---

## 2. Rate Limiting and API Abuse

What happens if a malicious actor writes a script to submit 10,000 jobs per second?
Our API will blindly write them to Postgres. Within seconds, Postgres connection pools will exhaust, and the entire platform will crash. This is a Denial of Service (DoS) attack.

### Scale Changes Everything
- **100 Users:** We don't need rate limiting.
- **10,000 Users:** We implement an in-memory token-bucket algorithm in Express.js. Users are limited to 100 requests per minute.
- **1 Million Users:** In-memory rate limiting fails because users bounce between 50 different API servers behind a Load Balancer. We must move Rate Limiting to a centralized Redis cache, or better yet, push it out to the edge using AWS WAF (Web Application Firewall) or Cloudflare.

---

## 3. Internal Network Security (Zero Trust)

In the 2000s, the standard security model was the "Castle and Moat." Everything outside the firewall was dangerous; everything inside was trusted. 

Modern distributed systems use **Zero Trust Architecture**.
- The `worker-service` does not trust the `scheduler-service`. 
- The `api-service` does not trust the Redis instance by default.

### Principle of Least Privilege
Every microservice should only have the exact permissions it needs to do its job.
Does the `api-service` need permission to `DROP TABLE jobs`? No. Its database user should only have `INSERT`, `SELECT`, and `UPDATE` permissions.

---

## Summary

Security in distributed systems is a multifaceted discipline. We successfully implemented stateless JWT authentication, strong tenant isolation, and Role-Based Access Control. 

However, even a perfectly secure system is impossible to maintain if you cannot see what is happening inside it. In the next chapter, we will explore the three pillars of Observability: Logs, Metrics, and Traces.
