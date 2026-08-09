/**
 * AutoLayoutService — assigns canvas positions to nodes in a BuilderState.
 *
 * Completely separated from serialization/deserialization.
 * Pluggable: swap TopologicalLayoutEngine for Dagre, ELK, or manual later.
 */

import { BuilderState, CanvasNode } from '../state/builder-state';

// ─── Layout Engine Interface ────────────────────────────────────────

export interface LayoutEngine {
    /** Assigns positions to all nodes. Returns a new BuilderState with updated positions. */
    layout(state: BuilderState): BuilderState;
}

// ─── Topological Layout Engine ──────────────────────────────────────

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;
const HORIZONTAL_GAP = 80;
const VERTICAL_GAP = 100;

export class TopologicalLayoutEngine implements LayoutEngine {
    layout(state: BuilderState): BuilderState {
        if (state.nodes.length === 0) return state;

        // 1. Build adjacency and in-degree maps
        const adj = new Map<string, string[]>();
        const inDegree = new Map<string, number>();

        for (const node of state.nodes) {
            adj.set(node.id, []);
            inDegree.set(node.id, 0);
        }

        for (const edge of state.edges) {
            adj.get(edge.source)?.push(edge.target);
            inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
        }

        // 2. Kahn's algorithm for topological sort by layers (BFS)
        const layers: string[][] = [];
        let queue = state.nodes.filter(n => (inDegree.get(n.id) || 0) === 0).map(n => n.id);

        while (queue.length > 0) {
            layers.push([...queue]);
            const nextQueue: string[] = [];

            for (const nodeId of queue) {
                for (const neighbor of (adj.get(nodeId) || [])) {
                    const newDeg = (inDegree.get(neighbor) || 1) - 1;
                    inDegree.set(neighbor, newDeg);
                    if (newDeg === 0) {
                        nextQueue.push(neighbor);
                    }
                }
            }
            queue = nextQueue;
        }

        // 3. Handle any remaining nodes (cycles — shouldn't happen if compiler validates)
        const placed = new Set(layers.flat());
        const unplaced = state.nodes.filter(n => !placed.has(n.id)).map(n => n.id);
        if (unplaced.length > 0) {
            layers.push(unplaced);
        }

        // 4. Assign positions: each layer is a row, centered horizontally
        const positionMap = new Map<string, { x: number; y: number }>();
        const maxWidth = Math.max(...layers.map(l => l.length));

        for (let row = 0; row < layers.length; row++) {
            const layer = layers[row];
            const totalWidth = layer.length * NODE_WIDTH + (layer.length - 1) * HORIZONTAL_GAP;
            const startX = (maxWidth * (NODE_WIDTH + HORIZONTAL_GAP) - totalWidth) / 2;

            for (let col = 0; col < layer.length; col++) {
                positionMap.set(layer[col], {
                    x: startX + col * (NODE_WIDTH + HORIZONTAL_GAP),
                    y: row * (NODE_HEIGHT + VERTICAL_GAP),
                });
            }
        }

        // 5. Apply positions
        const newNodes: CanvasNode[] = state.nodes.map(n => ({
            ...n,
            position: positionMap.get(n.id) || n.position,
        }));

        return {
            ...state,
            nodes: newNodes,
        };
    }
}

// ─── Default Export ─────────────────────────────────────────────────

/** Default layout engine used for imports without saved positions. */
export const defaultLayoutEngine: LayoutEngine = new TopologicalLayoutEngine();
