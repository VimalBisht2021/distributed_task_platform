import { PluginDefinition } from './plugin';

import { HttpPlugin } from '../../../plugins/http/manifest';
import { UtilitiesPlugin } from '../../../plugins/utilities/manifest';
import { CorePlugin } from '../../../plugins/core/manifest';
import { EmailPlugin } from '../../../plugins/email/manifest';
import { AIProviderPlugin } from '../../../plugins/ai/manifest';
import { ScriptPlugin } from '../../../plugins/script/manifest';
import { HelloWorldPlugin } from '../../../plugins/hello-world/manifest';

export const BuiltinPlugins: PluginDefinition[] = [
    HttpPlugin,
    UtilitiesPlugin,
    CorePlugin,
    EmailPlugin,
    AIProviderPlugin,
    ScriptPlugin,
    HelloWorldPlugin
];
