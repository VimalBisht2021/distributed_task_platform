# System Architecture

The Distributed Task Platform is divided into five strictly decoupled layers: Presentation, Compilation, Planning, Execution, and Observability.

## Architecture Layers

```mermaid
flowchart TD
    subgraph Presentation ["1. Presentation (React/Next.js)"]
        Builder[Visual Builder]
        Viewer[Execution Viewer]
    end

    subgraph Definition ["2. Definition"]
        WD[WorkflowDefinition JSON]
    end

    subgraph Compilation ["3. Compilation (Node.js)"]
        Compiler[Compilation Service]
        CW[CompiledWorkflow]
    end

    subgraph Planning ["4. Planning (Node.js)"]
        Planner[Execution Planner]
        EP[ExecutionPlan]
    end

    subgraph Execution ["5. Execution (Distributed)"]
        Dispatcher[Dispatcher]
        Scheduler[Scheduler]
        Workers[Worker Pool]
        StateRepo[(PostgreSQL)]
    end

    Builder -->|Exports| WD
    WD -->|POST /api/compile| Compiler
    Compiler -->|Validates & Hashes| CW
    CW -->|POST /api/executions| Planner
    Planner -->|Creates DAG| EP
    EP -->|Submits| Dispatcher
    
    Dispatcher -->|Leases| Workers
    Workers -->|Commits| StateRepo
```

### Layer Details

#### 1. Presentation
The Visual Builder acts as a pure, declarative JSON editor. It holds **no runtime logic** and has no concept of dependencies or compilation.

#### 2. Definition
The `WorkflowDefinition` is the public API contract. It describes nodes, properties, and un-validated routes.

#### 3. Compilation
The `CompilationService` bridges UI intent and runtime reality. It performs topological sorts, detects cycles using DFS coloring, strips UI metadata, and computes a deterministic semantic hash for caching.

#### 4. Planning
The `ExecutionPlanner` translates the `CompiledWorkflow` into an `ExecutionPlan`, creating a deterministic dependency graph ready for scheduling.

#### 5. Execution
The `TemporalScheduler` manages time-based triggers, while the `ExecutionDispatcher` assigns work (leases) to horizontally scaling worker nodes. State is managed via `InMemoryStateRepository` (or PostgreSQL in production).
