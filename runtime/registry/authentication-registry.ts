export class AuthenticationRegistry {
    private providers: Map<string, any> = new Map();

    public register(id: string, provider: any): void {
        if (this.providers.has(id)) {
            console.warn(`Auth provider ${id} already registered`);
            return;
        }
        this.providers.set(id, provider);
    }

    public resolve(id: string): any | undefined {
        return this.providers.get(id);
    }
}
