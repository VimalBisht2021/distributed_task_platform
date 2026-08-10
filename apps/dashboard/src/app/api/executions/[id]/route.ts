import { NextResponse } from 'next/server';
import { executionResults, stateRepo, journal } from '../../execute/route';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const basicInfo = executionResults.get(id);
    
    if (!basicInfo) {
        return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
    }

    if (!stateRepo || !journal) {
        return NextResponse.json({ error: 'Runtime not initialized' }, { status: 500 });
    }

    try {
        const executionRecord = await stateRepo.getExecution(id);
        const history = await journal.getEvents(id);

        let progress = 0;
        let completed = history.filter(e => e.type === 'TaskCompleted').length;
        let total = history.filter(e => e.type === 'TaskScheduled').length;
        if (total > 0) {
            progress = Math.floor((completed / total) * 100);
        }
        
        // If workflow is done
        if (history.some(e => e.type === 'WorkflowCompleted')) progress = 100;
        if (history.some(e => e.type === 'WorkflowFailed')) progress = 100;

        return NextResponse.json({
            id,
            jobId: id, // for compatibility with older UI
            status: progress === 100 ? (history.some(e => e.type === 'WorkflowFailed') ? 'FAILED' : 'COMPLETED') : basicInfo.status,
            progress,
            createdAt: basicInfo.startedAt,
            retryCount: 0,
            compiledWorkflowId: basicInfo.compiledWorkflowId,
            events: history.map(e => ({
                id: crypto.randomUUID(),
                jobId: id,
                eventType: e.type,
                createdAt: e.timestamp,
                details: e,
            }))
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
