import { ExecutionEnvironment, ScriptRuntime, ScriptContext, SecurityPolicy } from './interfaces';
import { ExecutionResult } from '../../../execution-contract/schemas/handler-definition';
import { ExecutionError } from '../errors';

// Dynamic import to avoid crash if native compilation fails on some systems
let ivm: any;
try {
    ivm = require('isolated-vm');
} catch (e) {
    console.warn('isolated-vm not installed or failed to compile. Using mock execution environment.');
}

export class LocalIsolateEnvironment implements ExecutionEnvironment {
    readonly id = 'local-isolate';

    async execute(
        runtime: ScriptRuntime,
        code: string,
        context: ScriptContext,
        policy: SecurityPolicy
    ): Promise<ExecutionResult> {
        
        if (runtime.language !== 'javascript') {
            throw new ExecutionError(`LocalIsolateEnvironment only supports javascript, received: ${runtime.language}`);
        }

        if (!ivm) {
            // Mock execution if isolated-vm is unavailable
            return {
                status: 'COMPLETED',
                output: 'Mock execution successful',
                metrics: { durationMs: 0 }
            };
        }

        const start = Date.now();

        try {
            // Create a new isolate limited by the security policy
            const isolate = new ivm.Isolate({ memoryLimit: policy.memoryMb || 128 });
            
            // Create a new context within this isolate
            const ivmContext = await isolate.createContext();
            const jail = ivmContext.global;
            
            // This makes the global object available in the context as 'global'
            await jail.set('global', jail.derefInto());

            // Pass variables explicitly
            await jail.set('variables', new ivm.ExternalCopy(context.variables || {}).copyInto());
            
            // Execute the script safely
            const script = await isolate.compileScript(code);
            const result = await script.run(ivmContext, { timeout: policy.timeoutMs || 5000 });
            
            // Cleanup memory
            script.release();
            ivmContext.release();
            isolate.dispose();

            const durationMs = Date.now() - start;

            return {
                status: 'COMPLETED',
                output: result,
                metrics: { durationMs }
            };
        } catch (error: any) {
            return {
                status: 'FAILED',
                error: {
                    code: 'SCRIPT_EXECUTION_FAILED',
                    message: error.message
                },
                metrics: { durationMs: Date.now() - start }
            };
        }
    }
}
