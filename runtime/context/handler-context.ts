import { ExecutionResult } from '../../../execution-contract/schemas/handler-definition';
import { ExecutionClock } from './execution-clock';

export interface HandlerContext {
    executionId: string;
    workflowRunId: string;
    taskRunId: string;
    correlationId: string;
    workerId: string;
    
    logger: any; // abstract logger
    metrics: any; // abstract metrics client
    
    configuration: Record<string, any>;
    variables: Record<string, any>;
    artifacts: Record<string, any>;
    
    secrets: { resolve(key: string): Promise<string | undefined> };
    storage: any; // abstract storage client
    eventPublisher: any; // abstract event client
    
    cancellationToken: { isCancelled: boolean };
    executionClock: ExecutionClock;
}

export interface HandlerLifecycle<Input = any, Output = any> {
    initialize?(): Promise<void>;
    validate(input: Input): Promise<boolean>;
    prepare(context: HandlerContext): Promise<void>;
    execute(input: Input, context: HandlerContext): Promise<ExecutionResult<Output>>;
    cleanup(context: HandlerContext): Promise<void>;
}
