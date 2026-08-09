import { PluginDefinition } from '../../runtime/plugins/plugin';
import { uuidDefinition, UuidHandler } from './uuid';
import { base64Definition, Base64Handler } from './base64';
import { hashDefinition, HashHandler } from './hash';
import { jsonDefinition, JsonTransformHandler } from './json';
import { templateDefinition, TemplateHandler } from './template';
import { TemplateEngine } from '../../runtime/template';

export const UtilitiesPlugin: PluginDefinition = {
    id: 'utilities',
    version: '1.0.0',
    description: 'Data transformation and utility capabilities',
    handlers: [
        { definition: uuidDefinition, implementation: new UuidHandler() },
        { definition: base64Definition, implementation: new Base64Handler() },
        { definition: hashDefinition, implementation: new HashHandler() },
        { definition: jsonDefinition, implementation: new JsonTransformHandler() },
        { definition: templateDefinition, implementation: new TemplateHandler(new TemplateEngine()) }
    ]
};
