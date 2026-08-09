/**
 * Built-in plugin manifests for the workflow engine.
 *
 * Adding a new plugin requires only adding a manifest here.
 * Zero UI code changes needed.
 */

import { PluginManifest } from './plugin-manifest';
import { pluginRegistry } from './plugin-registry';

const builtinPlugins: PluginManifest[] = [
    {
        id: 'core/http',
        name: 'HTTP Request',
        category: 'actions',
        pluginVersion: '1.0.0',
        minimumRuntimeVersion: '1.0.0',
        schemaVersion: 1,
        color: { bg: 'bg-blue-100', border: 'border-blue-500', text: 'text-blue-900' },
        handles: { inputs: ['default'], outputs: ['default'] },
        configSchema: [
            { key: 'method', type: 'select', title: 'Method', default: 'GET', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], required: true },
            { key: 'url', type: 'string', title: 'URL', default: 'https://api.example.com', required: true, placeholder: 'https://...' },
            { key: 'headers', type: 'json', title: 'Headers', default: '{}', placeholder: '{"Authorization": "Bearer ..."}' },
            { key: 'body', type: 'textarea', title: 'Request Body', placeholder: 'JSON body for POST/PUT' },
            { key: 'timeout', type: 'number', title: 'Timeout (ms)', default: 30000 },
            { key: 'retries', type: 'number', title: 'Retries', default: 3 },
        ],
    },
    {
        id: 'core/condition',
        name: 'Condition',
        category: 'logic',
        pluginVersion: '1.0.0',
        minimumRuntimeVersion: '1.0.0',
        schemaVersion: 1,
        color: { bg: 'bg-purple-100', border: 'border-purple-500', text: 'text-purple-900' },
        handles: { inputs: ['default'], outputs: ['true', 'false'] },
        configSchema: [
            { key: 'expression', type: 'string', title: 'Expression', default: 'variables.count > 10', required: true, placeholder: 'e.g. variables.status === "ok"' },
        ],
    },
    {
        id: 'core/parallel',
        name: 'Parallel Fork',
        category: 'logic',
        pluginVersion: '1.0.0',
        minimumRuntimeVersion: '1.0.0',
        schemaVersion: 1,
        color: { bg: 'bg-yellow-100', border: 'border-yellow-500', text: 'text-yellow-900' },
        handles: { inputs: ['default'], outputs: ['default'] },
        configSchema: [],
    },
    {
        id: 'core/join',
        name: 'Join',
        category: 'logic',
        pluginVersion: '1.0.0',
        minimumRuntimeVersion: '1.0.0',
        schemaVersion: 1,
        color: { bg: 'bg-orange-100', border: 'border-orange-500', text: 'text-orange-900' },
        handles: { inputs: ['default'], outputs: ['default'] },
        configSchema: [
            { key: 'mergeStrategy', type: 'select', title: 'Merge Strategy', default: 'object', options: ['concat', 'object', 'first'] },
        ],
    },
    {
        id: 'core/email',
        name: 'Email',
        category: 'actions',
        pluginVersion: '1.0.0',
        minimumRuntimeVersion: '1.0.0',
        schemaVersion: 1,
        color: { bg: 'bg-green-100', border: 'border-green-500', text: 'text-green-900' },
        handles: { inputs: ['default'], outputs: ['default'] },
        configSchema: [
            { key: 'to', type: 'string', title: 'To', required: true, placeholder: 'recipient@example.com' },
            { key: 'subject', type: 'string', title: 'Subject', required: true, placeholder: 'Email subject' },
            { key: 'body', type: 'textarea', title: 'Body', placeholder: 'Email body content' },
        ],
    },
    {
        id: 'core/ai',
        name: 'AI Generation',
        category: 'integrations',
        pluginVersion: '1.0.0',
        minimumRuntimeVersion: '1.0.0',
        schemaVersion: 1,
        color: { bg: 'bg-indigo-100', border: 'border-indigo-500', text: 'text-indigo-900' },
        handles: { inputs: ['default'], outputs: ['default'] },
        configSchema: [
            { key: 'model', type: 'select', title: 'Model', default: 'gpt-4', options: ['gpt-4', 'gpt-3.5-turbo', 'claude-3', 'gemini-pro'] },
            { key: 'prompt', type: 'textarea', title: 'Prompt', required: true, placeholder: 'Enter your prompt...' },
            { key: 'temperature', type: 'number', title: 'Temperature', default: 0.7 },
            { key: 'maxTokens', type: 'number', title: 'Max Tokens', default: 1000 },
        ],
    },
    {
        id: 'core/script',
        name: 'Script',
        category: 'actions',
        pluginVersion: '1.0.0',
        minimumRuntimeVersion: '1.0.0',
        schemaVersion: 1,
        color: { bg: 'bg-slate-100', border: 'border-slate-500', text: 'text-slate-900' },
        handles: { inputs: ['default'], outputs: ['default'] },
        configSchema: [
            { key: 'language', type: 'select', title: 'Language', default: 'javascript', options: ['javascript', 'python', 'shell'] },
            { key: 'code', type: 'textarea', title: 'Code', required: true, placeholder: '// Your code here...' },
        ],
    },
    {
        id: 'core/template',
        name: 'Template',
        category: 'actions',
        pluginVersion: '1.0.0',
        minimumRuntimeVersion: '1.0.0',
        schemaVersion: 1,
        color: { bg: 'bg-teal-100', border: 'border-teal-500', text: 'text-teal-900' },
        handles: { inputs: ['default'], outputs: ['default'] },
        configSchema: [
            { key: 'template', type: 'textarea', title: 'Template', required: true, placeholder: 'Hello {{name}}, your order {{orderId}} is ready.' },
            { key: 'variables', type: 'json', title: 'Variables', default: '{}', placeholder: '{"name": "variables.userName"}' },
        ],
    },
];

/**
 * Registers all built-in plugins with the global registry.
 * Call this once at application startup.
 */
export function registerBuiltinPlugins(): void {
    for (const manifest of builtinPlugins) {
        pluginRegistry.register(manifest);
    }
}

// Auto-register on module load
registerBuiltinPlugins();
