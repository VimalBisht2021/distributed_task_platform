import { HandlerRegistry } from '../registry/handler-registry';
import { HandlerDefinition } from '../../../execution-contract/schemas/handler-definition';

export class DiscoveryService {
    constructor(private registry: HandlerRegistry) {}

    listHandlers(category?: string): HandlerDefinition[] {
        // Return only stable or beta handlers, potentially hide internal/deprecated ones in the future
        const handlers = this.registry.list(category ? { category } : undefined);
        return handlers;
    }

    getHandler(id: string, version: string): HandlerDefinition | undefined {
        return this.registry.find(`${id}@${version}`);
    }

    getLatestHandler(id: string): HandlerDefinition | undefined {
        const defs = this.registry.list().filter(d => d.id === id);
        if (defs.length === 0) return undefined;
        defs.sort((a, b) => b.version.localeCompare(a.version));
        return defs[0];
    }

    listCategories(): string[] {
        return this.registry.categories();
    }
}
