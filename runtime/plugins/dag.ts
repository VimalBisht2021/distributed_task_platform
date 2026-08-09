import { PluginDefinition } from './plugin';
import { ExecutionError } from '../errors';

export class PluginDAG {
    private adjacencyList: Map<string, string[]> = new Map();
    private plugins: Map<string, PluginDefinition> = new Map();

    public addNode(plugin: PluginDefinition): void {
        this.plugins.set(plugin.id, plugin);
        if (!this.adjacencyList.has(plugin.id)) {
            this.adjacencyList.set(plugin.id, []);
        }

        const deps = plugin.dependsOn || [];
        for (const dep of deps) {
            this.adjacencyList.get(plugin.id)!.push(dep);
        }
    }

    public resolveOrder(): PluginDefinition[] {
        const visited = new Set<string>();
        const inProgress = new Set<string>();
        const order: PluginDefinition[] = [];

        const visit = (nodeId: string) => {
            if (inProgress.has(nodeId)) {
                throw new ExecutionError(`Circular dependency detected involving plugin: ${nodeId}`);
            }
            if (visited.has(nodeId)) {
                return;
            }

            inProgress.add(nodeId);

            const deps = this.adjacencyList.get(nodeId) || [];
            for (const dep of deps) {
                if (!this.plugins.has(dep)) {
                    throw new ExecutionError(`Missing required dependency: ${dep} (required by ${nodeId})`);
                }
                visit(dep);
            }

            // Check conflicts
            const plugin = this.plugins.get(nodeId)!;
            const conflicts = plugin.conflicts || [];
            for (const conflict of conflicts) {
                if (this.plugins.has(conflict)) {
                    throw new ExecutionError(`Plugin ${nodeId} conflicts with loaded plugin ${conflict}`);
                }
            }

            inProgress.delete(nodeId);
            visited.add(nodeId);
            order.push(plugin);
        };

        for (const nodeId of this.plugins.keys()) {
            if (!visited.has(nodeId)) {
                visit(nodeId);
            }
        }

        return order;
    }
}
