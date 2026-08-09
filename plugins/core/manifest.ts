import { PluginDefinition } from '../../runtime/plugins/plugin';
import { delayDefinition, DelayHandler } from './delay';
import { conditionDefinition, ConditionHandler } from './condition';
import { ExpressionEngine } from '../../runtime/expressions/engine';

export const CorePlugin: PluginDefinition = {
    id: 'core',
    version: '1.0.0',
    description: 'Core orchestration capabilities for the workflow engine',
    handlers: [
        { definition: delayDefinition, implementation: new DelayHandler() },
        { definition: conditionDefinition, implementation: new ConditionHandler(new ExpressionEngine()) }
    ]
};
