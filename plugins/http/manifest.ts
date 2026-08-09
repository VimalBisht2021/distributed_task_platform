import { PluginDefinition } from '../../runtime/plugins/plugin';
import { httpDefinition, HttpHandler } from './index';

export const HttpPlugin: PluginDefinition = {
    id: 'http',
    version: '1.0.0',
    description: 'Integration capabilities for HTTP requests',
    handlers: [
        { definition: httpDefinition, implementation: new HttpHandler() }
    ]
};
