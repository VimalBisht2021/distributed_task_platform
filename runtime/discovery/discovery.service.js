"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscoveryService = void 0;
class DiscoveryService {
    constructor(registry) {
        this.registry = registry;
    }
    listHandlers(category) {
        // Return only stable or beta handlers, potentially hide internal/deprecated ones in the future
        const handlers = this.registry.list(category ? { category } : undefined);
        return handlers;
    }
    getHandler(id, version) {
        return this.registry.find(`${id}@${version}`);
    }
    getLatestHandler(id) {
        const defs = this.registry.list().filter(d => d.id === id);
        if (defs.length === 0)
            return undefined;
        defs.sort((a, b) => b.version.localeCompare(a.version));
        return defs[0];
    }
    listCategories() {
        return this.registry.categories();
    }
}
exports.DiscoveryService = DiscoveryService;
