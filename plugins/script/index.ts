import { HandlerLifecycle, HandlerContext } from '../../runtime/context/handler-context';
import { ExecutionResult, HandlerDefinition, HandlerMaturity } from '../../execution-contract/schemas/handler-definition';
import { ScriptRuntime, ExecutionEnvironment, SecurityPolicy } from '../../runtime/scripting/interfaces';
import { ExecutionError } from '../../runtime/errors';

export interface ScriptTaskConfig {
    language: string;
    code: string;
    permissions?: {
        network?: boolean;
        filesystem?: boolean;
        environment?: boolean;
    };
    timeoutMs?: number;
    memoryMb?: number;
}

export const scriptDefinition: HandlerDefinition = {
    id: 'script',
    version: '1',
    displayName: 'Execute Script',
    description: 'Executes arbitrary code in a secure sandboxed environment',
    category: 'script',
    maturity: HandlerMaturity.BETA,
    inputSchema: { type: 'object' },
    outputSchema: { type: 'any' },
    configurationSchema: {
        type: 'object',
        properties: {
            language: { type: 'string', enum: ['javascript', 'python'] },
            code: { type: 'string' },
            permissions: { type: 'object' },
            timeoutMs: { type: 'number' },
            memoryMb: { type: 'number' }
        },
        required: ['language', 'code']
    },
    supportsRetry: true,
    supportsTimeout: true,
    supportsCancellation: true,
    supportsReplay: false,
    supportsStreaming: false,
    supportsCompensation: false,
    supportsScheduling: false,
    estimatedExecutionType: 'SLOW',
    tags: ['script', 'javascript', 'python', 'sandbox']
};

export class ScriptHandler implements HandlerLifecycle<ScriptTaskConfig, any> {
    private runtimeMap: Map<string, ScriptRuntime> = new Map();
    private environment: ExecutionEnvironment;

    constructor(runtimes: ScriptRuntime[], environment: ExecutionEnvironment) {
        this.environment = environment;
        for (const r of runtimes) {
            this.runtimeMap.set(r.language, r);
        }
    }

    async validate(input: ScriptTaskConfig): Promise<boolean> {
        if (!input.language || !input.code) {
            throw new Error('Missing required fields: language and code');
        }
        if (!this.runtimeMap.has(input.language)) {
            throw new Error(`Unsupported script language: ${input.language}`);
        }
        return true;
    }

    async prepare(context: HandlerContext): Promise<void> {
        // e.g. Pre-warm container if remote execution is required
    }

    async execute(input: ScriptTaskConfig, context: HandlerContext): Promise<ExecutionResult<any>> {
        const runtime = this.runtimeMap.get(input.language);
        if (!runtime) {
            throw new ExecutionError(`Unsupported script language: ${input.language}`);
        }

        // Validate the code structurally via the runtime
        await runtime.validate(input.code);

        // Security Policy definition based on the workflow configuration
        const policy: SecurityPolicy = {
            network: input.permissions?.network ?? false,
            filesystem: input.permissions?.filesystem ?? false,
            environment: input.permissions?.environment ?? false,
            timeoutMs: input.timeoutMs ?? 5000,
            memoryMb: input.memoryMb ?? 128
        };

        // Let the secure execution environment execute the code
        return this.environment.execute(
            runtime,
            input.code,
            { variables: context.variables, secrets: {}, logger: context.logger },
            policy
        );
    }

    async cleanup(context: HandlerContext): Promise<void> {}
}
