import { PluginDefinition } from '../../runtime/plugins/plugin';
import { aiProviderDefinition, AIProviderHandler } from './index';

const handler = new AIProviderHandler();

export const AIProviderPlugin: PluginDefinition = {
    id: 'ai-provider',
    version: '1.0.0',
    description: 'AI integration capability for the platform',
    handlers: [
        { definition: aiProviderDefinition, implementation: handler }
    ],
    async initialize(context: any) {
        if (context.aiProviderRegistry) {
            handler.setRegistry(context.aiProviderRegistry);
        }
    }
};
