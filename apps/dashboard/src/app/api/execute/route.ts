/**
 * Stub for the execute API route.
 * Provides shared in-memory state used by the executions/[id] route.
 */
import { NextResponse } from 'next/server';

export interface ExecutionInfo {
    status: string;
    startedAt: string;
    compiledWorkflowId?: string;
}

// In-memory execution tracking (shared across API routes)
export const executionResults = new Map<string, ExecutionInfo>();

// Placeholder stubs for runtime references
// These would be wired to the actual runtime in a full deployment
export const stateRepo: any = null;
export const journal: any = null;

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const executionId = crypto.randomUUID();

        executionResults.set(executionId, {
            status: 'PENDING',
            startedAt: new Date().toISOString(),
            compiledWorkflowId: body.workflowId,
        });

        return NextResponse.json({ id: executionId, status: 'PENDING' }, { status: 201 });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
