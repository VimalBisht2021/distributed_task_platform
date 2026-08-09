import { HandlerContext } from '../../../../runtime/context/handler-context';
import { ExecutionResult, HandlerDefinition, HandlerMaturity } from '../../../../execution-contract/schemas/handler-definition';
import { AbstractUtilityHandler } from '../abstract-utility-handler';
import { ValidationError } from '../../../../runtime/errors';

export interface Base64TaskConfig {
    action: 'encode' | 'decode';
    inputEncoding?: 'utf8' | 'hex' | 'ascii';
    outputEncoding?: 'utf8' | 'hex' | 'ascii';
    data: string;
}

export const base64Definition: HandlerDefinition = {
    id: 'base64',
    version: '1',
    displayName: 'Base64 Converter',
    description: 'Encodes or decodes Base64 strings',
    category: 'utility',
    maturity: HandlerMaturity.STABLE,
    inputSchema: { type: 'object' },
    outputSchema: { type: 'string' },
    configurationSchema: {
        type: 'object',
        properties: {
            action: { type: 'string', enum: ['encode', 'decode'] },
            data: { type: 'string' },
            inputEncoding: { type: 'string' },
            outputEncoding: { type: 'string' }
        },
        required: ['action', 'data']
    },
    supportsRetry: false,
    supportsTimeout: false,
    supportsCancellation: false,
    supportsReplay: true,
    supportsStreaming: false,
    supportsCompensation: false,
    supportsScheduling: false,
    estimatedExecutionType: 'FAST',
    tags: ['base64', 'encode', 'decode']
};

export class Base64Handler extends AbstractUtilityHandler<Base64TaskConfig, string> {
    
    async validate(input: Base64TaskConfig): Promise<boolean> {
        if (!['encode', 'decode'].includes(input.action)) {
            throw new ValidationError(`Unsupported action: ${input.action}. Allowed: encode, decode`);
        }
        return true;
    }

    async execute(input: Base64TaskConfig, context: HandlerContext): Promise<ExecutionResult<string>> {
        const start = context.executionClock.now().getTime();
        
        let output = '';
        if (input.action === 'encode') {
            const enc = (input.inputEncoding as BufferEncoding) || 'utf8';
            output = Buffer.from(input.data, enc).toString('base64');
        } else {
            const outEnc = (input.outputEncoding as BufferEncoding) || 'utf8';
            output = Buffer.from(input.data, 'base64').toString(outEnc);
        }

        const durationMs = context.executionClock.now().getTime() - start;

        return {
            status: 'COMPLETED',
            output,
            metrics: { durationMs }
        };
    }
}
