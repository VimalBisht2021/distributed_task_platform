import { HandlerContext } from '../../../runtime/context/handler-context';

type FilterFunction = (value: any, ...args: any[]) => any;

/**
 * Variable Interpolation Engine.
 * Supports property access: {{workflow.id}}
 * Supports pipes: {{user.name | default("Anonymous") | upper()}}
 */
export class TemplateEngine {
    private filters: Map<string, FilterFunction> = new Map();

    constructor() {
        // Register default filters
        this.registerFilter('upper', (val: any) => typeof val === 'string' ? val.toUpperCase() : val);
        this.registerFilter('lower', (val: any) => typeof val === 'string' ? val.toLowerCase() : val);
        this.registerFilter('default', (val: any, defaultVal: any) => (val === undefined || val === null || val === '') ? defaultVal : val);
    }

    public registerFilter(name: string, fn: FilterFunction) {
        this.filters.set(name, fn);
    }

    /**
     * Resolves a variable path against the layered context.
     * Precedence: Task -> Workflow -> Outputs -> Env -> System
     * (Simplified here by assuming context.variables contains the layered resolution already)
     */
    private resolveVariable(path: string, variables: Record<string, any>): any {
        const parts = path.split('.');
        let current = variables;
        for (const part of parts) {
            if (current === undefined || current === null) return undefined;
            current = current[part];
        }
        return current;
    }

    /**
     * Parses a single expression, e.g. `user.name | default("Anonymous") | upper()`
     */
    private evaluateExpression(expression: string, variables: Record<string, any>): any {
        const segments = expression.split('|').map(s => s.trim());
        const varPath = segments[0];
        
        let value = this.resolveVariable(varPath, variables);

        // Apply filters in sequence
        for (let i = 1; i < segments.length; i++) {
            const filterExpr = segments[i];
            // Basic parsing of filterName(arg1, arg2)
            const match = filterExpr.match(/^(\w+)\((.*)\)$/);
            if (match) {
                const filterName = match[1];
                const rawArgs = match[2];
                // Extremely simple arg parsing (doesn't handle commas inside strings well, but works for mock)
                const args = rawArgs ? rawArgs.split(',').map(a => {
                    const clean = a.trim();
                    if (clean.startsWith('"') && clean.endsWith('"')) return clean.slice(1, -1);
                    if (clean.startsWith("'") && clean.endsWith("'")) return clean.slice(1, -1);
                    if (!isNaN(Number(clean))) return Number(clean);
                    if (clean === 'true') return true;
                    if (clean === 'false') return false;
                    return clean;
                }) : [];

                const filterFn = this.filters.get(filterName);
                if (filterFn) {
                    value = filterFn(value, ...args);
                } else {
                    throw new Error(`Unknown filter: ${filterName}`);
                }
            } else {
                // Filter with no parens, e.g., | upper
                const filterFn = this.filters.get(filterExpr);
                if (filterFn) {
                    value = filterFn(value);
                } else {
                    throw new Error(`Unknown filter: ${filterExpr}`);
                }
            }
        }

        return value;
    }

    /**
     * Interpolates all {{...}} blocks in a string.
     */
    public renderString(template: string, context: HandlerContext): string {
        return template.replace(/\{\{(.*?)\}\}/g, (match, expression) => {
            const result = this.evaluateExpression(expression.trim(), context.variables);
            return result !== undefined && result !== null ? String(result) : '';
        });
    }

    /**
     * Deeply renders an object (e.g. HTTP headers/body)
     */
    public renderObject(obj: any, context: HandlerContext): any {
        if (typeof obj === 'string') {
            return this.renderString(obj, context);
        }
        if (Array.isArray(obj)) {
            return obj.map(item => this.renderObject(item, context));
        }
        if (typeof obj === 'object' && obj !== null) {
            const result: Record<string, any> = {};
            for (const [key, value] of Object.entries(obj)) {
                result[key] = this.renderObject(value, context);
            }
            return result;
        }
        return obj;
    }
}
