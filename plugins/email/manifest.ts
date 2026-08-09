import { PluginDefinition } from '../../runtime/plugins/plugin';
import { emailDefinition, EmailHandler } from './index';

export const EmailPlugin: PluginDefinition = {
    id: 'email-provider',
    version: '1.0.0',
    description: 'Email integration capability for the platform',
    handlers: [
        { definition: emailDefinition, implementation: new EmailHandler() }
    ]
};
