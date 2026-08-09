import { HandlerLifecycle, HandlerContext } from '../../runtime/context/handler-context';
import { ExecutionResult, HandlerDefinition, HandlerMaturity } from '../../execution-contract/schemas/handler-definition';

export interface EmailTaskConfig {
    to: string;
    from: string;
    subject: string;
    body: string;
    isHtml?: boolean;
}

export const emailDefinition: HandlerDefinition = {
    id: 'email',
    version: '1',
    displayName: 'Send Email',
    description: 'Sends an email via SMTP or API providers',
    category: 'integration',
    maturity: HandlerMaturity.STABLE,
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    configurationSchema: {
        type: 'object',
        properties: {
            to: { type: 'string' },
            from: { type: 'string' },
            subject: { type: 'string' },
            body: { type: 'string' },
            isHtml: { type: 'boolean' }
        },
        required: ['to', 'from', 'subject', 'body']
    },
    supportsRetry: true,
    supportsTimeout: true,
    supportsCancellation: false,
    supportsReplay: false,
    supportsStreaming: false,
    supportsCompensation: false,
    supportsScheduling: false,
    estimatedExecutionType: 'SLOW',
    tags: ['email', 'notification']
};

export class EmailHandler implements HandlerLifecycle<EmailTaskConfig, any> {
    async validate(input: EmailTaskConfig): Promise<boolean> {
        if (!input.to || !input.from || !input.subject || !input.body) {
            throw new Error('Missing required email fields');
        }
        return true;
    }

    async prepare(context: HandlerContext): Promise<void> {
        // e.g. Resolve SMTP credentials via context.secrets
    }

    async execute(input: EmailTaskConfig, context: HandlerContext): Promise<ExecutionResult<any>> {
        const start = context.executionClock.now().getTime();
        
        // Mock email sending
        context.logger?.info(`Sending email to ${input.to} with subject "${input.subject}"`);
        
        const durationMs = context.executionClock.now().getTime() - start;

        return {
            status: 'COMPLETED',
            output: {
                messageId: `mock-msg-${Date.now()}`,
                sentAt: context.executionClock.now().toISOString(),
                recipient: input.to
            },
            metrics: { durationMs }
        };
    }

    async cleanup(context: HandlerContext): Promise<void> {}
}
