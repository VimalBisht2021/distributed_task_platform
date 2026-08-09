import { HandlerDefinition } from '../../../execution-contract/schemas/handler-definition';
import { HandlerLifecycle } from '../context/handler-context';

export interface PluginHandler {
    definition: HandlerDefinition;
    implementation: HandlerLifecycle;
}

export interface PluginDefinition {
    id: string;
    version: string;
    description?: string;
    
    // Version Compatibility
    compatibility?: {
        runtime?: string;   // e.g., '^2.1.0'
        contract?: string;
        sdk?: string;
        plugins?: Record<string, string>; // e.g. { 'template': '^2.0' }
    };
    
    // Dependency Graph Metadata
    dependsOn?: string[];
    optional?: string[];
    conflicts?: string[];
    
    handlers?: PluginHandler[];
    schemas?: any[]; // JSON Schemas for the schema registry
    authProviders?: any[]; // For the AuthRegistry
    templateFilters?: any[]; // For the TemplateRegistry
    expressionOperators?: any[]; // For the ExpressionRegistry
    
    initialize?(runtimeContext?: any): Promise<void>;
    ready?(runtimeContext?: any): Promise<void>;
    shutdown?(runtimeContext?: any): Promise<void>;
    dispose?(runtimeContext?: any): Promise<void>;
}
