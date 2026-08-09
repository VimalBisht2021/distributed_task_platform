export class SchemaRegistry {
    private schemas: Map<string, any> = new Map();

    public register(id: string, schema: any): void {
        if (this.schemas.has(id)) {
            console.warn(`Schema ${id} already registered`);
            return;
        }
        this.schemas.set(id, schema);
    }

    public resolve(id: string): any | undefined {
        return this.schemas.get(id);
    }

    public list(): any[] {
        return Array.from(this.schemas.values());
    }
}
