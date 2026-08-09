import { HandlerLifecycle, HandlerContext } from '../../runtime/context/handler-context';
import { ExecutionResult, HandlerDefinition, HandlerMaturity } from '../../execution-contract/schemas/handler-definition';

export interface AIProviderTaskConfig {
    provider: string; // e.g. openai, anthropic
    model: string;
    prompt: string;
    temperature?: number;
    maxTokens?: number;
}

export const aiProviderDefinition: HandlerDefinition = {
    id: 'ai-prompt',
    version: '1',
    displayName: 'AI Prompt Execution',
    description: 'Executes a prompt against an LLM provider and returns the structured output',
    category: 'integration',
    maturity: HandlerMaturity.BETA,
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    configurationSchema: {
        type: 'object',
        properties: {
            provider: { type: 'string' },
            model: { type: 'string' },
            prompt: { type: 'string' },
            temperature: { type: 'number' },
            maxTokens: { type: 'number' }
        },
        required: ['provider', 'model', 'prompt']
    },
    supportsRetry: true,
    supportsTimeout: true,
    supportsCancellation: true,
    supportsReplay: false,
    supportsStreaming: false,
    supportsCompensation: false,
    supportsScheduling: false,
    estimatedExecutionType: 'SLOW',
    tags: ['ai', 'llm', 'openai', 'anthropic']
};

import { AIProviderRegistry } from '../../runtime/registry/ai-provider-registry';

export class AIProviderHandler implements HandlerLifecycle<AIProviderTaskConfig, any> {
    private registry!: AIProviderRegistry;

    public setRegistry(registry: AIProviderRegistry): void {
        this.registry = registry;
    }

    async validate(input: AIProviderTaskConfig): Promise<boolean> {
        if (!input.provider || !input.model || !input.prompt) {
            throw new Error('Missing required AI provider fields');
        }
        if (this.registry && !this.registry.resolve(input.provider)) {
            throw new Error(`AI Provider ${input.provider} is not registered`);
        }
        return true;
    }

    async prepare(context: HandlerContext): Promise<void> {}

    async execute(input: AIProviderTaskConfig, context: HandlerContext): Promise<ExecutionResult<any>> {
        const provider = this.registry.resolve(input.provider);
        if (!provider) {
            throw new Error(`AI Provider ${input.provider} is not registered`);
        }

        context.logger?.info(`Delegating AI Prompt to provider ${input.provider}`);
        return provider.executePrompt({
            model: input.model,
            prompt: input.prompt,
            temperature: input.temperature,
            maxTokens: input.maxTokens
        }, context);
    }

    async cleanup(context: HandlerContext): Promise<void> {}
}
