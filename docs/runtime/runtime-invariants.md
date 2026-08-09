# Distributed Task Platform: Runtime Invariants

These invariants constitute the engineering constitution for the platform.
Before any new feature, abstraction, or handler is proposed, it must be validated against these rules. If a proposal violates an invariant, the proposal is invalid.

## Execution Model
- A handler executes exactly once per successful scheduling attempt.
- A handler never mutates the `WorkflowDefinition`.
- The `ExecutionPlan` is strictly immutable once compiled.
- `WorkflowState` is the single source of truth for all execution data.

## Boundaries & Responsibilities
- The `Scheduler` never evaluates workflow logic or expressions.
- The `Planner` never executes handlers.
- The `AdmissionControl` never mutates workflow state.
- Only `ExecutionPolicies` (owned by the runtime) decide retry and timeout behavior; handlers do not control their own retry logic.
- Only the `Scheduler` owns time (delays, cron, wakeups).
- Only the `Runtime` owns execution.

## Plugins & Handlers
- Plugins cannot directly access the `StateRepository`. All state interactions must flow through the `WorkflowState` abstraction.
- Handlers are strictly deterministic given the exact same `ExecutionSession` and `WorkflowState`.

## Execution Planner Invariants (Mathematical Contract)
1. **Determinism (Stable Plan Hash)**: For identical `CompiledWorkflow` input, `planA == planB` and `planHashA == planHashB`. Hashing must use canonicalized serialization. No timestamps, UUIDs, or random ordering may influence the plan.
2. **Completeness**: Every node appears exactly once in the `ExecutionPlan`. Never duplicated, never missing.
3. **Dependency Preservation**: For every edge `A -> B`, the planner guarantees `order(A) < order(B)`.
4. **Cycle Rejection**: Every cyclic graph must fail compilation. Never partially compile or silently break cycles.
5. **Graph Connectivity**: Exactly one entry point (or supported set). Every node must be reachable from an entry point. Every edge references an existing node. No orphaned subgraphs. No isolated nodes.
6. **Routing Completeness**: Every routing target must exist. If a route targets a missing node, compilation fails.
7. **Terminal Reachability**: Every possible execution path should eventually terminate naturally or hit an explicit terminal node. Accidental dead ends are rejected.
8. **Parallel & Join Completeness**: Every Join must reference an existing Parallel. The Join must wait for exactly its parallel branches (no missing, no extra, no duplicate). Nested mismatches fail compilation.
9. **Checkpoint Placement**: Checkpoints must be deterministic. Identical workflows receive checkpoints in the exact same locations.

## Scheduler Invariants (Temporal Leases)
1. **Exactly Once Expiration**: No lease executes twice.
2. **Guaranteed Execution**: Every expired lease executes eventually.
3. **Restart Safety**: A crash must not lose pending leases. Upon restart, leases still fire correctly.
4. **Cancellation Wins**: If a lease is cancelled before expiration, it never executes.
5. **Time Ordering**: Earlier timestamps strictly execute before later timestamps.
6. **Strict Clock Abstraction**: The Scheduler never calls `Date.now()`. It strictly relies on an `ExecutionClock` abstraction to guarantee testability and simulated temporal jumps.

## Runtime Invariants (Distributed Execution)
1. **Idempotent Execution**: Every node executes 0 or 1 times (never twice). If a retry occurs, it replaces the prior attempt entirely.
2. **Branch Parentage**: Every parallel branch has exactly one parent node.
3. **Join Completion**: Every Join waits for *every* successful branch (or handles defined partial failures). It never proceeds prematurely.
4. **Persistence Guarantee**: No execution state or lease is ever lost after persistence is acknowledged.
5. **Resumability**: Every persisted execution is eventually resumable (e.g., after a crash, the exact state is restored and pending leases are polled).
6. **Deterministic Scheduling**: Given an identical ExecutionPlan, WorkflowState, SchedulerClock, and random seed, the scheduler must produce the exact same dispatch order.
7. **Exactly-Once Completion**: Every workflow node may be *attempted* multiple times (e.g. retries), but its observable completion is committed to the WorkflowState at most once.
