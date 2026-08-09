import { PluginDefinition } from '../../runtime/plugins/plugin';

export const HelloWorldPlugin: PluginDefinition = {
    id: 'sample/hello-world',
    name: 'Hello World',
    version: '1.0.0',
    description: 'A sample plugin demonstrating the SDK capabilities',
    icon: '👋',
    schema: {
        greeting: {
            type: 'string',
            required: true,
            default: 'Hello, World!',
            description: 'The greeting message to output'
        },
        repeatCount: {
            type: 'number',
            required: false,
            default: 1,
            description: 'Number of times to repeat the greeting'
        }
    },
    ui: {
        color: '#10b981', // Emerald 500
        handles: [
            { id: 'default', type: 'source' },
            { id: 'target', type: 'target' }
        ]
    }
};
