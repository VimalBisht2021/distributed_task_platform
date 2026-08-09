export interface WorkflowCheckpoints {
    save(id: string): void;
    restore(id: string): void;
    list(): string[];
}

export interface TaskState {
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'COMPENSATED';
    attempts: number;
    startTime?: Date;
    endTime?: Date;
    error?: any;
    output?: any;
}

export interface BranchState {
    activeBranches: string[];
    completedBranches: string[];
}

export interface WorkflowState {
    // Core data references
    readonly variables: Record<string, any>;
    readonly outputs: Record<string, any>;
    readonly metadata: Record<string, any>;

    // Secret references (resolved securely at runtime via policy)
    readonly secretReferences: string[];

    // Execution Cursor
    readonly cursor: {
        currentNodes: string[];
        waitingNodes: string[];
        runningNodes: string[];
        failedNodes: string[];
    };
    
    // Tracks the sequence of the last emitted event for strictly ordered append logs
    lastSequenceNumber: number;

    readonly taskState: Map<string, TaskState>;
    readonly branchState: BranchState;

    // Advanced recovery state
    readonly replayState: { isReplaying: boolean; replayPointId?: string };
    readonly compensationState: { isCompensating: boolean; compensatedTasks: string[] };
    readonly checkpoints: WorkflowCheckpoints;

    // Mutators
    setVariable(key: string, value: any): void;
    setOutput(key: string, value: any): void;
}
