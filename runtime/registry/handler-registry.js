"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HandlerRegistry = void 0;
class HandlerRegistry {
    constructor() {
        this.definitions = new Map();
        this.implementations = new Map();
    }
    static getInstance() {
        if (!HandlerRegistry.instance) {
            HandlerRegistry.instance = new HandlerRegistry();
        }
        return HandlerRegistry.instance;
    }
    register(definition, implementation) {
        const identifier = `${definition.id}@${definition.version}`;
        if (this.definitions.has(identifier)) {
            throw new Error(`Handler version ${identifier} is already registered. Versions are immutable.`);
        }
        this.definitions.set(identifier, definition);
        this.implementations.set(identifier, implementation);
    }
    find(identifier) {
        return this.definitions.get(identifier);
    }
    resolve(identifier) {
        return this.implementations.get(identifier);
    }
    resolveLatest(id) {
        // Mock simple resolution for latest by finding highest version string
        const defs = this.list().filter(d => d.id === id);
        if (defs.length === 0)
            return undefined;
        defs.sort((a, b) => b.version.localeCompare(a.version));
        return this.resolve(`${id}@${defs[0].version}`);
    }
    list(filters) {
        let all = Array.from(this.definitions.values());
        if (filters?.category) {
            all = all.filter(d => d.category === filters.category);
        }
        if (filters?.supportsRetry !== undefined) {
            all = all.filter(d => d.capabilities?.execution?.retry === filters.supportsRetry);
        }
        return all;
    }
    categories() {
        return ['trigger', 'core', 'integration', 'utility', 'script', 'internal', 'experimental'];
    }
}
exports.HandlerRegistry = HandlerRegistry;
