import { HandlerRegistry } from '../registry/handler-registry';
import { HandlerDefinition } from '../../../execution-contract/schemas/handler-definition';

export class DiscoveryService {
    constructor(private registry: HandlerRegistry) {}

    listHandlers(category?: string): HandlerDefinition[] {
        // Return only stable or beta handlers, potentially hide internal/deprecated ones in the future
        const handlers = this.registry.list(category);
        return handlers;
    }

    getHandler(id: string, version: string): HandlerDefinition | undefined {
        return this.registry.resolveVersion(id, version)?.definition;
    }

    getLatestHandler(id: string): HandlerDefinition | undefined {
        return this.registry.resolve(id)?.definition;
    }

    listCategories(): string[] {
        return this.registry.categories();
    }
}
