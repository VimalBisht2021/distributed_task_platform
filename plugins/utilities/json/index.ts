import { HandlerContext } from '../../../../runtime/context/handler-context';
import { ExecutionResult, HandlerDefinition, HandlerMaturity } from '../../../../execution-contract/schemas/handler-definition';
import { AbstractUtilityHandler } from '../abstract-utility-handler';
import { ValidationError, ExecutionError } from '../../../../runtime/errors';

export interface JsonTransformTaskConfig {
    operation: 'parse' | 'stringify' | 'merge' | 'pick' | 'omit' | 'flatten';
    data: any;
    target?: any; // Used for merge operations
}

export const jsonTransformDefinition: HandlerDefinition = {
    id: 'json',
    version: '1',
    displayName: 'JSON Transform',
    description: 'Parses, stringifies, or transforms JSON data',
    category: 'utility',
    maturity: HandlerMaturity.STABLE,
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    configurationSchema: {
        type: 'object',
        properties: {
            operation: { type: 'string', enum: ['parse', 'stringify', 'merge', 'pick', 'omit', 'flatten'] },
            data: { type: 'object' }
        },
        required: ['operation', 'data']
    },
    supportsRetry: false,
    supportsTimeout: false,
    supportsCancellation: false,
    supportsReplay: true,
    supportsStreaming: false,
    supportsCompensation: false,
    supportsScheduling: false,
    estimatedExecutionType: 'FAST',
    tags: ['json', 'transform', 'parse']
};

export class JsonTransformHandler extends AbstractUtilityHandler<JsonTransformTaskConfig, any> {
    
    async validate(input: JsonTransformTaskConfig): Promise<boolean> {
        const supported = ['parse', 'stringify'];
        if (!supported.includes(input.operation)) {
            // We only implement parse/stringify right now. The rest are reserved.
            throw new ValidationError(`Operation ${input.operation} is reserved for future use. Allowed today: parse, stringify`);
        }
        return true;
    }

    async execute(input: JsonTransformTaskConfig, context: HandlerContext): Promise<ExecutionResult<any>> {
        const start = context.executionClock.now().getTime();
        
        let output: any = null;

        try {
            if (input.operation === 'parse') {
                if (typeof input.data !== 'string') {
                    throw new ValidationError('Input data for parse must be a string');
                }
                output = JSON.parse(input.data);
            } else if (input.operation === 'stringify') {
                output = JSON.stringify(input.data);
            }
        } catch (e: any) {
            throw new ExecutionError(`JSON Transformation Failed: ${e.message}`);
        }

        const durationMs = context.executionClock.now().getTime() - start;

        return {
            status: 'COMPLETED',
            output,
            metrics: { durationMs }
        };
    }
}
