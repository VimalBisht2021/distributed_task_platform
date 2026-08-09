import { HandlerDefinition, HandlerLifecycle } from '../../../execution-contract/schemas/handler-definition';

export class HandlerRegistry {
    private static instance: HandlerRegistry;
    
    private definitions: Map<string, HandlerDefinition> = new Map();
    private implementations: Map<string, HandlerLifecycle> = new Map();

    private constructor() {}

    public static getInstance(): HandlerRegistry {
        if (!HandlerRegistry.instance) {
            HandlerRegistry.instance = new HandlerRegistry();
        }
        return HandlerRegistry.instance;
    }

    public register(definition: HandlerDefinition, implementation: HandlerLifecycle): void {
        const identifier = `${definition.id}@${definition.version}`;
        if (this.definitions.has(identifier)) {
            throw new Error(`Handler version ${identifier} is already registered. Versions are immutable.`);
        }
        this.definitions.set(identifier, definition);
        this.implementations.set(identifier, implementation);
    }

    public find(identifier: string): HandlerDefinition | undefined {
        return this.definitions.get(identifier);
    }

    public resolve(identifier: string): HandlerLifecycle | undefined {
        return this.implementations.get(identifier);
    }
    
    public resolveLatest(id: string): HandlerLifecycle | undefined {
        // Mock simple resolution for latest by finding highest version string
        const defs = this.list().filter(d => d.id === id);
        if (defs.length === 0) return undefined;
        defs.sort((a, b) => b.version.localeCompare(a.version));
        return this.resolve(`${id}@${defs[0].version}`);
    }

    public list(filters?: { category?: string, supportsRetry?: boolean }): HandlerDefinition[] {
        let all = Array.from(this.definitions.values());
        if (filters?.category) {
            all = all.filter(d => d.category === filters.category);
        }
        if (filters?.supportsRetry !== undefined) {
            all = all.filter(d => d.supportsRetry === filters.supportsRetry);
        }
        return all;
    }
    
    public categories(): string[] {
        return ['trigger', 'core', 'integration', 'utility', 'script', 'internal', 'experimental'];
    }
}
