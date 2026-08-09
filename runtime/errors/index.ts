export class ExecutionError extends Error {
    constructor(message: string, public readonly details?: Record<string, any>) {
        super(message);
        this.name = this.constructor.name;
    }
}

export class ValidationError extends ExecutionError {}
export class NetworkError extends ExecutionError {}
export class AuthenticationError extends ExecutionError {}
export class TimeoutError extends ExecutionError {}
export class RateLimitError extends ExecutionError {}
export class ProviderError extends ExecutionError {}
export class ConfigurationError extends ExecutionError {}
export class RetryableError extends ExecutionError {}
export class PermanentError extends ExecutionError {}
