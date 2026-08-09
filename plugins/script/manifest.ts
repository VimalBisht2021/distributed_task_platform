import { PluginDefinition } from '../../runtime/plugins/plugin';
import { scriptDefinition, ScriptHandler } from './index';
import { JavaScriptRuntime } from '../../runtime/scripting/javascript-runtime';
import { LocalIsolateEnvironment } from '../../runtime/scripting/local-isolate-environment';

export const ScriptPlugin: PluginDefinition = {
    id: 'script-sandbox',
    version: '1.0.0',
    description: 'Provides sandboxed execution environments for JavaScript and other languages',
    handlers: [
        { 
            definition: scriptDefinition, 
            implementation: new ScriptHandler(
                [new JavaScriptRuntime()], 
                new LocalIsolateEnvironment()
            ) 
        }
    ]
};
