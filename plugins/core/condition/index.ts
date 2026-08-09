import { HandlerLifecycle, HandlerContext } from '../../../../runtime/context/handler-context';
import { ExecutionResult, HandlerDefinition, HandlerMaturity } from '../../../../execution-contract/schemas/handler-definition';
import { ExpressionEngine, CompiledExpression } from '../../../../runtime/expressions/engine';
import { ExecutionError } from '../../../../runtime/errors';

export interface ConditionBranch {
    expression: string;
    next: string;
}

export interface ConditionTaskConfig {
    branches: ConditionBranch[];
    default: string;
}

export const conditionDefinition: HandlerDefinition = {
    id: 'condition',
    version: '1',
    displayName: 'Condition Router',
    description: 'Evaluates expressions to route execution to different branches.',
    category: 'core',
    maturity: HandlerMaturity.STABLE,
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    configurationSchema: {
        type: 'object',
        properties: {
            branches: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        expression: { type: 'string' },
                        next: { type: 'string' }
                    },
                    required: ['expression', 'next']
                }
            },
            default: { type: 'string' }
        },
        required: ['branches', 'default']
    },
    supportsRetry: false,
    supportsTimeout: false,
    supportsCancellation: false,
    supportsReplay: true,
    supportsStreaming: false,
    supportsCompensation: false,
    supportsScheduling: false,
    estimatedExecutionType: 'FAST',
    tags: ['condition', 'routing', 'if']
};

export class ConditionHandler implements HandlerLifecycle<ConditionTaskConfig, any> {
    private engine: ExpressionEngine;
    private compiledCache: Map<string, CompiledExpression> = new Map();

    constructor(engine: ExpressionEngine) {
        this.engine = engine;
    }

    async validate(input: ConditionTaskConfig): Promise<boolean> {
        if (!input.branches || !Array.isArray(input.branches)) {
            throw new Error('Condition must have branches array');
        }
        if (!input.default) {
            throw new Error('Condition must have a default branch mapping');
        }
        return true;
    }

    async prepare(context: HandlerContext): Promise<void> {
        // Compile expressions once and cache them.
        // In a real system, compilation happens during workflow deployment, not at runtime prepare.
        // This is a simulated caching mechanism for the mock runtime.
        const config = context.configuration as ConditionTaskConfig;
        if (config?.branches) {
            for (const branch of config.branches) {
                if (!this.compiledCache.has(branch.expression)) {
                    const compiled = this.engine.compile(
                        `cond_${Date.now()}`,
                        branch.expression
                    );
                    this.compiledCache.set(branch.expression, compiled);
                }
            }
        }
    }

    async execute(input: ConditionTaskConfig, context: HandlerContext): Promise<ExecutionResult<any>> {
        const start = context.executionClock.now().getTime();
        
        let targetBranch = input.default;

        // Evaluate branches in order
        for (const branch of input.branches) {
            const compiled = this.compiledCache.get(branch.expression);
            if (!compiled) {
                throw new ExecutionError(`Compiled expression missing for: ${branch.expression}`);
            }

            const isMatch = this.engine.evaluate(compiled, context);
            if (isMatch) {
                targetBranch = branch.next;
                break;
            }
        }

        const durationMs = context.executionClock.now().getTime() - start;

        return {
            status: 'COMPLETED',
            routing: { branch: targetBranch },
            metrics: { durationMs }
        };
    }

    async cleanup(context: HandlerContext): Promise<void> {}
}
