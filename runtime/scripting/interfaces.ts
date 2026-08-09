import { ExecutionResult } from '../../../execution-contract/schemas/handler-definition';
import { HandlerContext } from '../context/handler-context';

export interface RuntimeCapabilities {
    networking: boolean;
    filesystem: boolean;
    environmentVariables: boolean;
    maxExecutionTime: number;
    maxMemory: number;
    supportsAsync: boolean;
}

export interface SecurityPolicy {
    network: boolean;
    filesystem: boolean;
    environment: boolean;
    timeoutMs: number;
    memoryMb: number;
}

export interface ScriptContext {
    variables: Record<string, any>;
    secrets: Record<string, string>; // Pre-resolved secrets based on policy
    logger: any; // Safely injected logger
}

export interface ScriptRuntime {
    readonly language: string;
    capabilities(): RuntimeCapabilities;
    validate(code: string): Promise<void>;
}

export interface ExecutionEnvironment {
    readonly id: string; // e.g. "local-isolate", "docker", "firecracker"
    execute(
        runtime: ScriptRuntime,
        code: string,
        context: ScriptContext,
        policy: SecurityPolicy
    ): Promise<ExecutionResult>;
}
