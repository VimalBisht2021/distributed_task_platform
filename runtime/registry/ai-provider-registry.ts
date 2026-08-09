import { ExecutionResult } from '../../execution-contract/schemas/handler-definition';
import { HandlerContext } from '../context/handler-context';

export interface AIPromptRequest {
    model: string;
    prompt: string;
    temperature?: number;
    maxTokens?: number;
}

export interface AIProvider {
    readonly id: string; // e.g. "openai", "anthropic"
    executePrompt(request: AIPromptRequest, context: HandlerContext): Promise<ExecutionResult>;
}

export class AIProviderRegistry {
    private providers: Map<string, AIProvider> = new Map();

    public register(provider: AIProvider): void {
        if (this.providers.has(provider.id)) {
            console.warn(`AI Provider ${provider.id} is already registered.`);
            return;
        }
        this.providers.set(provider.id, provider);
    }

    public resolve(id: string): AIProvider | undefined {
        return this.providers.get(id);
    }

    public list(): AIProvider[] {
        return Array.from(this.providers.values());
    }
}
