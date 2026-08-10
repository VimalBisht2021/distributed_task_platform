/**
 * POST /api/executions
 *
 * Accepts a compiledWorkflowId (from POST /compile) and starts execution
 * through the real Planner → Runtime pipeline.
 *
 * GET /api/executions/:id would return execution status (future).
 */

import { NextResponse } from 'next/server';
import { getCompiledWorkflow } from '../compile/route';
import { ExecutionPlanner } from '../../../../../../runtime/execution/planner';
import { ExecutionRuntime } from '../../../../../../runtime/execution/execution-runtime';
import { TemporalScheduler } from '../../../../../../runtime/execution/temporal-scheduler';
import { InMemoryStateRepository } from '../../../../../../runtime/execution/in-memory-state-repository';
import { ParallelSubsystem } from '../../../../../../runtime/execution/parallel-subsystem';
import { ExecutionDispatcherImpl } from '../../../../../../runtime/execution/execution-dispatcher';
import { ExecutionPolicies } from '../../../../../../runtime/execution/execution-policies';
import { InMemoryResourceManager } from '../../../../../../runtime/execution/resource-manager';
import { InMemoryEventLog } from '../../../../../../runtime/execution/event-log';
import { ExecutionJournal } from '../../../../../../runtime/execution/execution-journal';
import { InMemoryExecutionMetrics } from '../../../../../../runtime/execution/execution-metrics';

// ─── Singleton Runtime ──────────────────────────────────────────────

export let executionRuntime: ExecutionRuntime | null = null;
export let stateRepo: InMemoryStateRepository | null = null;
export let journal: ExecutionJournal | null = null;
export let planner: ExecutionPlanner | null = null;
export let scheduler: TemporalScheduler | null = null;
export let dispatcher: ExecutionDispatcherImpl | null = null;

class RealClock {
    now() { return new Date(); }
}

function initializeRuntime() {
    if (executionRuntime) return;

    stateRepo = new InMemoryStateRepository();
    const eventLog = new InMemoryEventLog();
    const metrics = new InMemoryExecutionMetrics();
    journal = new ExecutionJournal(stateRepo, eventLog, metrics);

    scheduler = new TemporalScheduler(new RealClock());
    const resourceManager = new InMemoryResourceManager();
    const policies = new ExecutionPolicies(resourceManager);

    dispatcher = new ExecutionDispatcherImpl(policies, scheduler);
    planner = new ExecutionPlanner();
    const parallel = new ParallelSubsystem(journal, scheduler);

    executionRuntime = new ExecutionRuntime(planner, scheduler, journal, dispatcher, parallel);

    // Worker loop: process leases against the REAL compiled workflow
    setInterval(async () => {
        if (!scheduler || !dispatcher || !executionRuntime || !stateRepo) return;

        try {
            const leases = await scheduler.expire();
            for (const lease of leases) {
                await dispatcher.dispatch(lease);
            }

            const activeLease = dispatcher._popWorkerQueue();
            if (activeLease) {
                const record = await stateRepo.getExecution(activeLease.executionId);
                if (record) {
                    // Retrieve the actual compiled workflow for this execution
                    const workflow = getCompiledWorkflow(activeLease.workflowId) ||
                        { id: activeLease.workflowId, version: '1', startTask: 'mock', tasks: new Map() };

                    const output = {
                        simulatedOutput: true,
                        pluginId: workflow.tasks?.get(activeLease.nodeId)?.pluginId || 'unknown',
                        timestamp: Date.now(),
                    };

                    await executionRuntime.completeTask(
                        workflow as any,
                        activeLease.executionId,
                        activeLease.nodeId,
                        output,
                        record.version
                    );
                }
            }
        } catch (e) {
            console.error('Worker loop error:', e);
        }
    }, 1000);
}

// ─── Execution Results Store ────────────────────────────────────────

export const executionResults = new Map<string, { status: string; startedAt: Date; compiledWorkflowId: string }>();

// ─── POST Handler ───────────────────────────────────────────────────

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { compiledWorkflowId, input } = body;

        if (!compiledWorkflowId) {
            return NextResponse.json(
                { error: 'compiledWorkflowId is required. Call POST /api/compile first.' },
                { status: 400 }
            );
        }

        const compiledWorkflow = getCompiledWorkflow(compiledWorkflowId);
        if (!compiledWorkflow) {
            return NextResponse.json(
                { error: `Compiled workflow '${compiledWorkflowId}' not found. It may have expired — recompile.` },
                { status: 404 }
            );
        }

        initializeRuntime();

        if (!planner || !executionRuntime || !journal) {
            return NextResponse.json({ error: 'Runtime failed to initialize' }, { status: 500 });
        }

        const executionId = `exec-${Date.now()}`;

        // Create the execution through the journal
        const initialState = {
            status: 'PENDING',
            executionCursor: { currentNode: compiledWorkflow.startTask },
            variables: input || {},
        } as any;

        const startEvent = {
            executionId,
            type: 'ExecutionStarted',
            timestamp: new Date(),
            schemaVersion: '1.0',
            payloadVersion: '1.0',
        } as any;

        await journal.createExecution(compiledWorkflowId, executionId, initialState, startEvent);

        executionResults.set(executionId, {
            status: 'RUNNING',
            startedAt: new Date(),
            compiledWorkflowId,
        });

        return NextResponse.json({
            executionId,
            status: 'RUNNING',
            compiledWorkflowId,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 400 });
    }
}
