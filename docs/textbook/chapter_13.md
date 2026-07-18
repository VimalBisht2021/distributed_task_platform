# Chapter 13: Observability

When a monolith fails, you know exactly where to look. When a distributed system fails, the failure could be hiding in one of 50 microservices, a network bridge, a message broker, or a database lock.

Monitoring tells you *when* a system is broken. **Observability** gives you the tools to figure out *why* it is broken. 

---

## 1. The Three Pillars of Observability

### Pillar 1: Logging (The Event Record)
A log is an immutable timestamped record of an event. 
- *Bad Log:* `Error processing job.` (Useless).
- *Good Log (Structured Logging):* 
  ```json
  {"level": "error", "timestamp": "2026-07-18T10:00:00Z", "service": "worker-1", "jobId": "123", "error": "Stripe API timeout"}
  ```

### Pillar 2: Metrics (The System Health)
Metrics are numerical representations of data measured over intervals of time. They are cheap to store.
- **📍 Our Project:** We implemented a `/metrics` endpoint on every service. **Prometheus** scrapes these every 5 seconds. We expose metrics like `jobs_processed_total` and `queue_depth`. **Grafana** then draws real-time graphs.

### Pillar 3: Distributed Tracing (The Journey)
Tracing tracks a single user request as it travels through every microservice.

**Mental Model: The Tracking Number**
> When you mail a package via FedEx, they attach a Barcode (Trace ID). Every time the package enters a truck, a warehouse, or an airplane (Microservices), the barcode is scanned. You can view the entire journey on a timeline.

**📍 Our Project (Aspirational Design):** 
While our codebase fully implements Logging and Metrics, Distributed Tracing is an *aspirational* target design not currently implemented. When implemented in the future, the API will generate a unique `trace_id` and attach it to the job payload. When the Worker pulls the job from Redis, it will read the `trace_id` and include it in all of its logs, allowing us to stitch the distributed logs back together in a tool like Datadog.

---

## Evolution Timeline of Observability
- **2000s:** SSH into the server and run `grep "Error" /var/log/syslog`. 
- **2010s (Centralization):** The ELK Stack (Elasticsearch, Logstash, Kibana). All microservices ship their logs to a central search engine.
- **2020s (OpenTelemetry):** OpenTelemetry (OTel) becomes the industry standard for generating traces, logs, and metrics in a unified, vendor-agnostic format, shipping them to advanced tools like Datadog or Honeycomb.

---

## 2. Defining Reliability: SLIs, SLOs, and SLAs

### How Engineers Think: The Progression of Reliability
- **Junior Engineer:** "The API crashed. I will add a `console.log()` to see why."
- **Senior Engineer:** "The API crashed. I will add a Prometheus metric for `api_error_rate` and set up an alert to page me on PagerDuty if it spikes above 5%."
- **Principal Engineer:** "The API crashed. But does the user care? What is our Service Level Objective (SLO)? If our SLO says we can tolerate 45 minutes of downtime a month, and we've only used 5 minutes, we don't need to wake anyone up at 2 AM. We'll fix it on Monday."

### SLI (Service Level Indicator)
A quantitative measure of the level of service. (e.g., "Percentage of requests returning HTTP 200 in < 200ms").

### SLO (Service Level Objective)
The internal engineering goal. (e.g., "99.9% of requests over 30 days must succeed").

### SLA (Service Level Agreement)
The legal contract with customers. (e.g., "If uptime drops below 99.9%, we refund 10% of your bill").

---

## Summary

Observability is the nervous system of a distributed application. But how do we prove the system actually survives the failures we designed it for? We cannot wait for a production outage to find out if our Zombie Sweeper works. 

In the next chapter, we will explore Testing Distributed Systems and Chaos Engineering.
