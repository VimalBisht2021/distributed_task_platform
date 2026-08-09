import { AstNode, CompiledExpression } from './ast';
import { HandlerContext } from '../context/handler-context';
import { ExecutionError } from '../errors';

export class ExpressionParser {
    parse(expression: string): AstNode {
        // Mocking a real AST parser (e.g., jexl, acorn)
        return {
            type: 'MOCK_BINARY_EXPRESSION',
            raw: expression
        };
    }
}

export class ExpressionCompiler {
    private parser = new ExpressionParser();

    compile(id: string, expression: string): CompiledExpression {
        const ast = this.parser.parse(expression);
        return {
            id,
            source: expression,
            ast,
            variables: [] // Mock extracted variables
        };
    }
}

export class ExpressionEvaluator {
    evaluate(compiled: CompiledExpression, context: HandlerContext): any {
        // Mock evaluation logic. In reality, traverse AST against context.variables
        const source = compiled.source.trim();
        
        // Very rudimentary mock logic for "order.total > 100" style expressions
        try {
            if (source.includes('>')) {
                const parts = source.split('>');
                const leftVar = this.resolveVariable(parts[0].trim(), context.variables);
                const rightVal = parseFloat(parts[1].trim());
                return leftVar > rightVal;
            }
            if (source.includes('==')) {
                const parts = source.split('==');
                const leftVar = this.resolveVariable(parts[0].trim(), context.variables);
                let rightVal = parts[1].trim();
                if (rightVal.startsWith('"') && rightVal.endsWith('"')) rightVal = rightVal.slice(1, -1);
                return leftVar == rightVal;
            }
            return false;
        } catch (e: any) {
            throw new ExecutionError(`Expression evaluation failed: ${e.message}`);
        }
    }

    private resolveVariable(path: string, variables: Record<string, any>): any {
        const parts = path.split('.');
        let current = variables;
        for (const part of parts) {
            if (current === undefined || current === null) return undefined;
            current = current[part];
        }
        return current;
    }
}

export class ExpressionEngine {
    private compiler = new ExpressionCompiler();
    private evaluator = new ExpressionEvaluator();

    compile(id: string, expression: string): CompiledExpression {
        return this.compiler.compile(id, expression);
    }

    evaluate(compiled: CompiledExpression, context: HandlerContext): any {
        return this.evaluator.evaluate(compiled, context);
    }
}
