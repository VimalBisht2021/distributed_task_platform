import { ScriptRuntime, RuntimeCapabilities } from './interfaces';
import { ExecutionError } from '../errors';

export class JavaScriptRuntime implements ScriptRuntime {
    readonly language = 'javascript';

    capabilities(): RuntimeCapabilities {
        return {
            networking: false, // Enforced by environment
            filesystem: false, // Enforced by environment
            environmentVariables: true,
            maxExecutionTime: 60000,
            maxMemory: 512,
            supportsAsync: true
        };
    }

    async validate(code: string): Promise<void> {
        if (!code || code.trim() === '') {
            throw new ExecutionError('Script code cannot be empty');
        }
        
        // Basic syntax checking could happen here via a light AST parser (acorn)
        // For now, we assume structural correctness or fail at execution
    }
}
