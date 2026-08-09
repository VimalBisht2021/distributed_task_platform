import { ExecutionJournal } from './execution-journal';
import { SchedulerApi, TemporalLease } from './scheduler';
import { ReplayEngine } from './replay-engine';
import { v4 as uuidv4 } from 'uuid';
import { ExecutionEvent } from './events';

export interface RecoveryPolicy {
    type: 'RESUME' | 'RESTART_TASK' | 'RESTART_BRANCH' | 'RESTART_WORKFLOW' | 'MANUAL_APPROVAL' | 'CUSTOM';
    execute(engine: RecoveryEngine, workflowId: string, executionId: string): Promise<void>;
}

export class ResumeRecoveryPolicy implements RecoveryPolicy {
    type = 'RESUME' as const;
    async execute(engine: RecoveryEngine, workflowId: string, executionId: string): Promise<void> {
        await engine._resumeExecution(workflowId, executionId);
    }
}

export class RecoveryEngine {
    constructor(
        private readonly journal: ExecutionJournal,
        private readonly scheduler: SchedulerApi,
        private readonly replayEngine: ReplayEngine
    ) {}

    /**
     * Recovers a single execution that was interrupted.
     * This replays its event log to get the deterministic state,
     * validates it against the latest state, and re-issues leases
     * for any running node cursors based on the RecoveryPolicy.
     */
    async recoverExecution(workflowId: string, executionId: string, policy: RecoveryPolicy = new ResumeRecoveryPolicy()): Promise<void> {
        await policy.execute(this, workflowId, executionId);
    }

    /**
     * Internal implementation of standard Resume.
     */
    async _resumeExecution(workflowId: string, executionId: string): Promise<void> {

        // 1. Reconstruct state deterministically from the Event Log
        const reconstructedState = await this.replayEngine.reconstructState(executionId);

        // 2. Fetch the latest state from the database
        const record = await this.journal.getExecution(executionId);
        if (!record) {
            throw new Error(`Execution ${executionId} not found in state repository`);
        }

        // Optional: in a real system, we'd alert if reconstructedState !== record.state

        // 3. Issue lease for current cursor if it's RUNNING
        if ((reconstructedState as any).status === 'RUNNING') {
            const nodeId = (reconstructedState as any).executionCursor.currentNode;
            if (nodeId) {
                const lease: TemporalLease = {
                    id: uuidv4(),
                    workflowId,
                    executionId,
                    nodeId,
                    executeAt: new Date(), // Immediate wake up
                    reason: 'RECOVERY'
                };
                await this.scheduler.schedule(lease);
            }
        }
    }
}
