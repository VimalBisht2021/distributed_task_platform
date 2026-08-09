import { ExecutionJournal } from './execution-journal';
import { ExecutionEvent } from './events';
import { WorkflowState } from './workflow-state';
import { ExecutionPlan } from './planner';

export class TimelineService {
    constructor(private readonly journal: ExecutionJournal) {}

    /**
     * Retrieves the full sequence of events for a given execution.
     */
    async getTimeline(executionId: string): Promise<ExecutionEvent[]> {
        return this.journal.getEvents(executionId);
    }

    /**
     * Retrieves the latest persisted state snapshot for a given execution.
     * In the future, this can be expanded to return multiple historical checkpoints.
     */
    async getCheckpoints(executionId: string): Promise<WorkflowState[]> {
        const record = await this.journal.getExecution(executionId);
        return record ? [record.state] : [];
    }

    /**
     * Retrieves execution metrics (duration, task times, retries) for a given execution.
     */
    getMetrics(executionId: string): any {
        return this.journal.getMetrics(executionId);
    }

    /**
     * Rebuilds the execution graph state, mapping nodes to their current runtime statuses
     * and timings, to be consumed directly by the Visual Builder or Replay Viewer.
     */
    async getGraph(executionId: string, plan: ExecutionPlan): Promise<any> {
        const record = await this.journal.getExecution(executionId);
        if (!record) return null;

        const nodes = plan.nodes.map(n => ({
            id: n.id,
            pluginId: n.pluginId,
            status: record.state.executionCursor.currentNode === n.id ? 'ACTIVE' : 'IDLE', // Simplified
            // Include timings from metrics later
        }));

        return {
            nodes,
            edges: plan.edges,
            activeNode: record.state.executionCursor.currentNode,
            status: record.state.status,
            variables: record.state.variables
        };
    }
}
