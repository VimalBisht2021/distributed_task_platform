import { ScriptHandler } from './index';
import { JavaScriptRuntime } from '../../runtime/scripting/javascript-runtime';
import { LocalIsolateEnvironment } from '../../runtime/scripting/local-isolate-environment';
import { HandlerContext } from '../../runtime/context/handler-context';

describe('Script Sandbox Chaos Tests', () => {
    let handler: ScriptHandler;
    let mockContext: HandlerContext;

    beforeEach(() => {
        handler = new ScriptHandler([new JavaScriptRuntime()], new LocalIsolateEnvironment());
        mockContext = {
            invocationId: 'test-1',
            variables: { inputData: 'hello' },
            secrets: {},
            logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } as any,
            executionClock: { now: () => new Date() } as any
        } as HandlerContext;
    });

    it('should successfully execute a basic script', async () => {
        const input = {
            language: 'javascript',
            code: 'return variables.inputData + " world";'
        };

        const result = await handler.execute(input, mockContext);
        expect(result.status).toBe('COMPLETED');
        expect(result.output).toBe('hello world');
    });

    it('should enforce timeout limits for infinite loops', async () => {
        const input = {
            language: 'javascript',
            code: 'while(true) {}',
            timeoutMs: 100 // strict timeout
        };

        const result = await handler.execute(input, mockContext);
        expect(result.status).toBe('FAILED');
        expect(result.error?.message).toContain('timeout');
    });

    it('should prevent access to Node.js built-ins', async () => {
        const input = {
            language: 'javascript',
            code: 'const fs = require("fs"); return fs.existsSync("/");'
        };

        const result = await handler.execute(input, mockContext);
        expect(result.status).toBe('FAILED');
        expect(result.error?.message).toContain('require is not defined');
    });
});
