import { PluginDefinition } from './plugin';
import { HandlerRegistry } from '../registry/handler-registry';
import { SchemaRegistry } from '../registry/schema-registry';
import { AuthenticationRegistry } from '../registry/authentication-registry';
import { TemplateRegistry } from '../registry/template-registry';
import { ExpressionRegistry } from '../registry/expression-registry';
import { AIProviderRegistry } from '../registry/ai-provider-registry';
import { PluginDAG } from './dag';

export class PluginManager {
    private static instance: PluginManager;
    private plugins: Map<string, PluginDefinition> = new Map();

    private handlerRegistry: HandlerRegistry;
    private schemaRegistry: SchemaRegistry;
    private authRegistry: AuthenticationRegistry;
    private templateRegistry: TemplateRegistry;
    private expressionRegistry: ExpressionRegistry;
    private aiProviderRegistry: AIProviderRegistry;

    private constructor() {
        this.handlerRegistry = HandlerRegistry.getInstance();
        this.schemaRegistry = new SchemaRegistry();
        this.authRegistry = new AuthenticationRegistry();
        this.templateRegistry = new TemplateRegistry();
        this.expressionRegistry = new ExpressionRegistry();
        this.aiProviderRegistry = new AIProviderRegistry();
    }

    public static getInstance(): PluginManager {
        if (!PluginManager.instance) {
            PluginManager.instance = new PluginManager();
        }
        return PluginManager.instance;
    }

    public async loadAll(plugins: PluginDefinition[]): Promise<void> {
        const dag = new PluginDAG();
        for (const plugin of plugins) {
            dag.addNode(plugin);
        }

        const orderedPlugins = dag.resolveOrder();

        for (const plugin of orderedPlugins) {
            await this.initializePlugin(plugin);
        }
    }

    private async initializePlugin(plugin: PluginDefinition): Promise<void> {
        const identifier = `${plugin.id}@${plugin.version}`;
        
        if (this.plugins.has(identifier)) {
            console.warn(`Plugin ${identifier} is already loaded.`);
            return;
        }

        if (plugin.initialize) {
            await plugin.initialize({ 
                schemaRegistry: this.schemaRegistry,
                authRegistry: this.authRegistry,
                templateRegistry: this.templateRegistry,
                expressionRegistry: this.expressionRegistry,
                aiProviderRegistry: this.aiProviderRegistry
            });
        }

        if (plugin.handlers) {
            for (const handler of plugin.handlers) {
                this.handlerRegistry.register(handler.definition, handler.implementation);
            }
        }

        if (plugin.schemas) {
            for (const schema of plugin.schemas) {
                if (schema.id) this.schemaRegistry.register(schema.id, schema);
            }
        }

        if (plugin.authProviders) {
            for (const provider of plugin.authProviders) {
                if (provider.id) this.authRegistry.register(provider.id, provider);
            }
        }

        if (plugin.templateFilters) {
            for (const filter of plugin.templateFilters) {
                if (filter.name) this.templateRegistry.registerFilter(filter.name, filter.fn);
            }
        }

        if (plugin.expressionOperators) {
            for (const op of plugin.expressionOperators) {
                if (op.name) this.expressionRegistry.registerOperator(op.name, op.fn);
            }
        }

        this.plugins.set(identifier, plugin);
        console.log(`Loaded plugin: ${identifier}`);
    }

    public async readyAll(): Promise<void> {
        for (const plugin of this.plugins.values()) {
            if (plugin.ready) {
                await plugin.ready();
            }
        }
    }

    public async shutdownAll(): Promise<void> {
        for (const plugin of this.plugins.values()) {
            if (plugin.shutdown) {
                await plugin.shutdown();
            }
        }
    }

    public async disposeAll(): Promise<void> {
        for (const plugin of this.plugins.values()) {
            if (plugin.dispose) {
                await plugin.dispose();
            }
        }
        this.plugins.clear();
    }

    public listPlugins(): PluginDefinition[] {
        return Array.from(this.plugins.values());
    }
}
