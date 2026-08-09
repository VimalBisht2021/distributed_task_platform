import { HandlerContext } from '../../../../runtime/context/handler-context';
import { ExecutionResult, HandlerDefinition, HandlerMaturity } from '../../../../execution-contract/schemas/handler-definition';
import { AbstractUtilityHandler } from '../abstract-utility-handler';
import { ValidationError } from '../../../../runtime/errors';
import * as crypto from 'crypto';

export interface HashTaskConfig {
    algorithm: 'sha256' | 'sha512' | 'md5';
    encoding: 'hex' | 'base64';
    data: string;
}

export const hashDefinition: HandlerDefinition = {
    id: 'hash',
    version: '1',
    displayName: 'Cryptographic Hash',
    description: 'Generates cryptographic hashes',
    category: 'utility',
    maturity: HandlerMaturity.STABLE,
    inputSchema: { type: 'object' },
    outputSchema: { type: 'string' },
    configurationSchema: {
        type: 'object',
        properties: {
            algorithm: { type: 'string', enum: ['sha256', 'sha512', 'md5'] },
            encoding: { type: 'string', enum: ['hex', 'base64'] },
            data: { type: 'string' }
        },
        required: ['algorithm', 'encoding', 'data']
    },
    supportsRetry: false,
    supportsTimeout: false,
    supportsCancellation: false,
    supportsReplay: true,
    supportsStreaming: false,
    supportsCompensation: false,
    supportsScheduling: false,
    estimatedExecutionType: 'FAST',
    tags: ['hash', 'crypto', 'sha256']
};

export class HashHandler extends AbstractUtilityHandler<HashTaskConfig, string> {
    
    async validate(input: HashTaskConfig): Promise<boolean> {
        if (!['sha256', 'sha512', 'md5'].includes(input.algorithm)) {
            throw new ValidationError(`Unsupported algorithm: ${input.algorithm}. Allowed: sha256, sha512, md5`);
        }
        if (!['hex', 'base64'].includes(input.encoding)) {
            throw new ValidationError(`Unsupported encoding: ${input.encoding}. Allowed: hex, base64`);
        }
        return true;
    }

    async execute(input: HashTaskConfig, context: HandlerContext): Promise<ExecutionResult<string>> {
        const start = context.executionClock.now().getTime();
        
        const hash = crypto.createHash(input.algorithm);
        hash.update(input.data, 'utf8');
        const output = hash.digest(input.encoding);

        const durationMs = context.executionClock.now().getTime() - start;

        return {
            status: 'COMPLETED',
            output,
            metrics: { durationMs }
        };
    }
}
