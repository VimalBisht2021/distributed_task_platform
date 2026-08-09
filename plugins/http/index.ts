import { HandlerLifecycle, HandlerContext } from '../../../../runtime/context/handler-context';
import { ExecutionResult, HandlerDefinition, HandlerMaturity } from '../../../../execution-contract/schemas/handler-definition';
import { ErrorCategory, HandlerExecutionError } from '../../../../execution-contract/schemas/errors';
import { AuthenticationConfiguration, AuthenticationProvider } from '../../../runtime/authentication';
import { TemplateEngine } from '../../../runtime/template';

export interface HttpTaskConfig {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    url: string;
    headers?: Record<string, string>;
    query?: Record<string, string>;
    body?: any;
    authentication?: AuthenticationConfiguration;
    timeout?: number;
    followRedirects?: boolean;
    responseMapping?: {
        body?: string;
        status?: string;
    };
}

export const httpDefinition: HandlerDefinition = {
    id: 'http',
    version: '1',
    displayName: 'HTTP Request',
    description: 'Declarative HTTP Client for API integration.',
    category: 'integration',
    maturity: HandlerMaturity.STABLE,
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    configurationSchema: {
        type: 'object',
        properties: {
            method: { type: 'string' },
            url: { type: 'string' },
            headers: { type: 'object' },
            query: { type: 'object' },
            authentication: { type: 'object' }
        },
        required: ['method', 'url']
    },
    supportsRetry: false, // Owned by execution engine!
    supportsTimeout: false, // Owned by execution engine!
    supportsCancellation: true,
    supportsReplay: true,
    supportsStreaming: false,
    supportsCompensation: false,
    supportsScheduling: false,
    estimatedExecutionType: 'LONG_RUNNING',
    tags: ['http', 'api', 'rest']
};

export class HttpHandler implements HandlerLifecycle<HttpTaskConfig, any> {
    private authProviders: AuthenticationProvider<any>[];
    private templateEngine: TemplateEngine;

    constructor(authProviders: AuthenticationProvider<any>[], templateEngine: TemplateEngine) {
        this.authProviders = authProviders;
        this.templateEngine = templateEngine;
    }

    async validate(input: HttpTaskConfig): Promise<boolean> {
        if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(input.method.toUpperCase())) {
            throw new HandlerExecutionError(ErrorCategory.VALIDATION_FAILED, `Invalid HTTP method: ${input.method}`);
        }
        if (input.method.toUpperCase() === 'GET' && input.body) {
            throw new HandlerExecutionError(ErrorCategory.VALIDATION_FAILED, `GET requests cannot contain a body`);
        }
        return true;
    }

    async prepare(context: HandlerContext): Promise<void> {
        // No heavy DB connections to open.
    }

    async execute(input: HttpTaskConfig, context: HandlerContext): Promise<ExecutionResult<any>> {
        // 1. Interpolate the configuration using workflow variables
        const requestConfig = this.templateEngine.renderObject(input, context);

        // 2. Apply Authentication
        if (requestConfig.authentication) {
            const provider = this.authProviders.find(p => p.supports(requestConfig.authentication!.provider));
            if (!provider) {
                throw new HandlerExecutionError(
                    ErrorCategory.AUTHENTICATION_FAILED, 
                    `Unsupported auth provider: ${requestConfig.authentication.provider}`
                );
            }
            await provider.authenticate(requestConfig, context, requestConfig.authentication);
        }

        const start = context.executionClock.now().getTime();

        try {
            // 3. Mock HTTP Execution
            context.logger.info(`Executing HTTP ${requestConfig.method} ${requestConfig.url}`);
            
            // In a real implementation, axios or node-fetch goes here.
            // Using a simple delay to mock network IO
            const mockNetworkCall = new Promise(resolve => setTimeout(resolve, 50));
            await mockNetworkCall;

            const rawResponse = {
                status: 200,
                headers: { 'content-type': 'application/json' },
                body: { id: 123, message: 'Success' }
            };

            // 4. Response Mapping (Prevent giant objects flowing through DTP)
            let mappedOutput = rawResponse;
            if (requestConfig.responseMapping) {
                // A very simplified mock of JSONPath extraction ($ -> root)
                mappedOutput = {
                    status: requestConfig.responseMapping.status ? rawResponse.status : undefined,
                    body: requestConfig.responseMapping.body ? rawResponse.body : undefined
                };
            }

            const durationMs = context.executionClock.now().getTime() - start;

            return {
                status: 'COMPLETED',
                output: mappedOutput,
                metrics: { durationMs }
            };

        } catch (error: any) {
            // Standardize errors
            if (error.code === 'ECONNABORTED') {
                throw new HandlerExecutionError(ErrorCategory.NETWORK_TIMEOUT, 'Request timed out');
            }
            if (error.response?.status === 429) {
                throw new HandlerExecutionError(ErrorCategory.RATE_LIMITED, 'Rate limited', { headers: error.response.headers });
            }
            if (error.response?.status >= 500) {
                throw new HandlerExecutionError(ErrorCategory.HTTP_500, 'Upstream server error');
            }
            
            throw new HandlerExecutionError(ErrorCategory.INTERNAL_ERROR, error.message || 'Unknown error');
        }
    }

    async cleanup(context: HandlerContext): Promise<void> {
        // Close sockets if needed
    }
}
