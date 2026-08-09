import { HandlerLifecycle, HandlerContext } from '../../../../runtime/context/handler-context';
import { ExecutionResult, HandlerDefinition, HandlerMaturity } from '../../../../execution-contract/schemas/handler-definition';
import { TemplateEngine } from '../../../runtime/template';

export interface TemplateTaskConfig {
    template: string;
}

export const templateDefinition: HandlerDefinition = {
    id: 'template',
    version: '1',
    displayName: 'Template Parser',
    description: 'Generates strings using the Template Engine with variable interpolation and filters.',
    category: 'utility',
    maturity: HandlerMaturity.STABLE,
    inputSchema: { type: 'object' },
    outputSchema: { type: 'string' },
    configurationSchema: {
        type: 'object',
        properties: {
            template: { type: 'string', description: 'The template string, e.g. "Hello {{user.name}}"' }
        },
        required: ['template']
    },
    supportsRetry: false,
    supportsTimeout: false,
    supportsCancellation: false,
    supportsReplay: true,
    supportsStreaming: false,
    supportsCompensation: false,
    supportsScheduling: false,
    estimatedExecutionType: 'FAST',
    tags: ['template', 'string', 'render']
};

export class TemplateHandler implements HandlerLifecycle<TemplateTaskConfig, string> {
    private templateEngine: TemplateEngine;

    constructor(templateEngine: TemplateEngine) {
        this.templateEngine = templateEngine;
    }

    async validate(input: TemplateTaskConfig): Promise<boolean> {
        if (!input.template || typeof input.template !== 'string') {
            throw new Error('Template must be a non-empty string');
        }
        return true;
    }

    async prepare(context: HandlerContext): Promise<void> {}

    async execute(input: TemplateTaskConfig, context: HandlerContext): Promise<ExecutionResult<string>> {
        const start = context.executionClock.now().getTime();
        
        const rendered = this.templateEngine.renderString(input.template, context);
        
        const durationMs = context.executionClock.now().getTime() - start;

        return {
            status: 'COMPLETED',
            output: rendered,
            metrics: { durationMs }
        };
    }

    async cleanup(context: HandlerContext): Promise<void> {}
}
