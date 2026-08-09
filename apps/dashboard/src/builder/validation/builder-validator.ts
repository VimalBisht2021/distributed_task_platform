import { BuilderState } from '../state/builder-state';

export class BuilderValidator {
    static validate(state: BuilderState): Array<{ nodeId: string; message: string }> {
        const errors: Array<{ nodeId: string; message: string }> = [];

        // Simple validation: Ensure Condition nodes have both true and false paths
        for (const node of state.nodes) {
            if (node.pluginId === 'core/condition') {
                const outEdges = state.edges.filter(e => e.source === node.id);
                if (outEdges.length < 2) {
                    errors.push({ nodeId: node.id, message: 'Condition must have true and false routes.' });
                }
            }
        }

        // Check for isolated nodes (no incoming and no outgoing, unless it's the only node)
        if (state.nodes.length > 1) {
            for (const node of state.nodes) {
                const hasConnections = state.edges.some(e => e.source === node.id || e.target === node.id);
                if (!hasConnections) {
                    errors.push({ nodeId: node.id, message: 'Node is disconnected from the workflow.' });
                }
            }
        }

        return errors;
    }
}
