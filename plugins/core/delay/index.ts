import { HandlerLifecycle, HandlerContext } from '../../../../runtime/context/handler-context';
import { ExecutionResult, HandlerDefinition, HandlerMaturity } from '../../../../execution-contract/schemas/handler-definition';

export const delayDefinition: HandlerDefinition = {
    id: 'delay',
    version: '1',
    displayName: 'Delay',
    description: 'Pauses workflow execution until a specified time or duration.',
    category: 'core',
    maturity: HandlerMaturity.STABLE,
    inputSchema: {
        type: 'object',
        properties: {
            durationMs: { type: 'number' },
            wakeUpAt: { type: 'string' } // ISO8601
        },
        description: 'Specify either durationMs or wakeUpAt.'
    },
    outputSchema: { type: 'null' },
    configurationSchema: { type: 'object' },
    supportsRetry: false,
    supportsTimeout: false,
    supportsCancellation: true,
    supportsReplay: true,
    supportsStreaming: false,
    supportsCompensation: false,
    supportsScheduling: true, // Crucial flag indicating the scheduler handles this
    estimatedExecutionType: 'FAST', // Fast because it yields immediately
    tags: ['time', 'wait', 'pause']
};

export class DelayHandler implements HandlerLifecycle<{ durationMs?: number, wakeUpAt?: string }, null> {
    
    async validate(input: { durationMs?: number, wakeUpAt?: string }): Promise<boolean> {
        if (!input.durationMs && !input.wakeUpAt) {
            throw new Error('Either durationMs or wakeUpAt must be provided');
        }
        return true;
    }

    async prepare(context: HandlerContext): Promise<void> {
        // No connections needed for delay
    }

    async execute(input: { durationMs?: number, wakeUpAt?: string }, context: HandlerContext): Promise<ExecutionResult<null>> {
        let wakeUpTime: Date;

        if (input.wakeUpAt) {
            wakeUpTime = new Date(input.wakeUpAt);
        } else if (input.durationMs) {
            wakeUpTime = new Date(Date.now() + input.durationMs);
        } else {
            throw new Error('Invalid input');
        }

        context.logger.info(`Delaying execution of ${context.taskRunId} until ${wakeUpTime.toISOString()}`);

        return {
            status: 'WAITING',
            directive: {
                wakeUpAt: wakeUpTime.toISOString(),
                reason: 'DELAY_TASK'
            },
            metadata: {
                requestedDelay: input.durationMs ? `${input.durationMs}ms` : undefined,
                scheduledAt: context.executionClock.now().toISOString(),
                wakeUpAt: wakeUpTime.toISOString()
            }
        };
    }

    async cleanup(context: HandlerContext): Promise<void> {
        // No cleanup needed
    }
}
