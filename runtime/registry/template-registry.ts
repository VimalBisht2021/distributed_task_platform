export class TemplateRegistry {
    private filters: Map<string, Function> = new Map();

    public registerFilter(name: string, filterFn: Function): void {
        if (this.filters.has(name)) {
            console.warn(`Template filter ${name} already registered`);
            return;
        }
        this.filters.set(name, filterFn);
    }

    public resolveFilter(name: string): Function | undefined {
        return this.filters.get(name);
    }
}
