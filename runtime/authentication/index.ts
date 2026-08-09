import { HandlerContext } from '../../../runtime/context/handler-context';

export interface AuthenticationConfiguration {
    provider: string; // e.g. 'bearer', 'basic', 'oauth2'
    credentialKey?: string; // The secret key in the SecretProvider
    [key: string]: any;
}

/**
 * A generic interface for authenticating ANY integration.
 * T represents the target being authenticated (e.g., an HTTP Request config object, or a DB client).
 */
export interface AuthenticationProvider<T> {
    /**
     * Identifies if this provider handles the requested auth type (e.g. 'bearer')
     */
    supports(type: string): boolean;

    /**
     * Mutates or authenticates the target using the provided config and secrets.
     */
    authenticate(
        target: T,
        context: HandlerContext,
        config: AuthenticationConfiguration
    ): Promise<T>;
}

// -------------------------------------------------------------
// Mock Implementation for HTTP Bearer Tokens
// -------------------------------------------------------------

export interface HttpRequestTarget {
    headers: Record<string, string>;
}

export class BearerTokenAuthenticationProvider implements AuthenticationProvider<HttpRequestTarget> {
    supports(type: string): boolean {
        return type.toLowerCase() === 'bearer';
    }

    async authenticate(
        target: HttpRequestTarget,
        context: HandlerContext,
        config: AuthenticationConfiguration
    ): Promise<HttpRequestTarget> {
        
        if (!config.credentialKey) {
            throw new Error('Bearer token authentication requires a credentialKey');
        }

        const token = await context.secrets.resolve(config.credentialKey);
        
        if (!token) {
            throw new Error(`Secret not found for key: ${config.credentialKey}`);
        }

        // Mutate the target (inject the header)
        if (!target.headers) {
            target.headers = {};
        }
        
        target.headers['Authorization'] = `Bearer ${token}`;

        return target;
    }
}
