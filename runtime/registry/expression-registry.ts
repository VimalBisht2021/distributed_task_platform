export class ExpressionRegistry {
    private operators: Map<string, Function> = new Map();

    public registerOperator(name: string, operatorFn: Function): void {
        if (this.operators.has(name)) {
            console.warn(`Expression operator ${name} already registered`);
            return;
        }
        this.operators.set(name, operatorFn);
    }

    public resolveOperator(name: string): Function | undefined {
        return this.operators.get(name);
    }
}
