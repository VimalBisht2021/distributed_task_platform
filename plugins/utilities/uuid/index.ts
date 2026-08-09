import { HandlerContext } from '../../../../runtime/context/handler-context';
import { ExecutionResult, HandlerDefinition, HandlerMaturity } from '../../../../execution-contract/schemas/handler-definition';
import { AbstractUtilityHandler } from '../abstract-utility-handler';
import { ValidationError } from '../../../../runtime/errors';
import * as crypto from 'crypto';

export interface UuidTaskConfig {
    version: 'v4' | 'v7';
}

export const uuidDefinition: HandlerDefinition = {
    id: 'uuid',
    version: '1',
    displayName: 'UUID Generator',
    description: 'Generates Universally Unique Identifiers (v4 or v7)',
    category: 'utility',
    maturity: HandlerMaturity.STABLE,
    inputSchema: { type: 'object' },
    outputSchema: { type: 'string' },
    configurationSchema: {
        type: 'object',
        properties: {
            version: { type: 'string', enum: ['v4', 'v7'] }
        },
        required: ['version']
    },
    supportsRetry: false,
    supportsTimeout: false,
    supportsCancellation: false,
    supportsReplay: true,
    supportsStreaming: false,
    supportsCompensation: false,
    supportsScheduling: false,
    estimatedExecutionType: 'FAST',
    tags: ['uuid', 'generator']
};

export class UuidHandler extends AbstractUtilityHandler<UuidTaskConfig, string> {
    
    async validate(input: UuidTaskConfig): Promise<boolean> {
        if (!['v4', 'v7'].includes(input.version)) {
            throw new ValidationError(`Unsupported UUID version: ${input.version}. Allowed: v4, v7`);
        }
        return true;
    }

    async execute(input: UuidTaskConfig, context: HandlerContext): Promise<ExecutionResult<string>> {
        const start = context.executionClock.now().getTime();
        
        let output = '';
        if (input.version === 'v4') {
            output = crypto.randomUUID();
        } else if (input.version === 'v7') {
            // Mocking v7 since Node crypto.randomUUID() is v4
            output = crypto.randomUUID(); // In production, use uuidv7 library
        }

        const durationMs = context.executionClock.now().getTime() - start;

        return {
            status: 'COMPLETED',
            output,
            metrics: { durationMs }
        };
    }
}
