/**
 * Clipboard Commands — Copy, Paste, Duplicate, DeleteSelection.
 *
 * All operations generate new IDs for pasted/duplicated nodes
 * to prevent ID collisions and maintain replay integrity.
 */

import { Command } from './Command';
import { BuilderState, CanvasNode, CanvasEdge } from '../state/builder-state';

const PASTE_OFFSET = { x: 40, y: 40 };

/** Internal clipboard (module-level, shared across commands). */
let clipboard: { nodes: CanvasNode[]; edges: CanvasEdge[] } = { nodes: [], edges: [] };

/**
 * Copies selected nodes and their connecting edges to the clipboard.
 * This is a no-op command (doesn't mutate state) — it only writes to clipboard.
 */
export class CopySelectionCommand implements Command {
    type = 'COPY_SELECTION';

    constructor(private readonly selectedNodeIds: string[]) {}

    execute(state: BuilderState): BuilderState {
        const selectedSet = new Set(this.selectedNodeIds);
        clipboard = {
            nodes: state.nodes.filter(n => selectedSet.has(n.id)),
            edges: state.edges.filter(e => selectedSet.has(e.source) && selectedSet.has(e.target)),
        };
        return state; // No mutation
    }

    undo(state: BuilderState): BuilderState {
        return state; // Copy is not undoable (clipboard is external state)
    }
}

/**
 * Pastes clipboard contents onto the canvas with new IDs and offset positions.
 */
export class PasteCommand implements Command {
    type = 'PASTE';
    private pastedNodeIds: string[] = [];

    execute(state: BuilderState): BuilderState {
        if (clipboard.nodes.length === 0) return state;

        const idMapping = new Map<string, string>();
        const now = Date.now();

        // Generate new IDs for each pasted node
        const newNodes: CanvasNode[] = clipboard.nodes.map((n, i) => {
            const newId = `node-${now}-${i}`;
            idMapping.set(n.id, newId);
            this.pastedNodeIds.push(newId);

            return {
                ...n,
                id: newId,
                position: {
                    x: n.position.x + PASTE_OFFSET.x,
                    y: n.position.y + PASTE_OFFSET.y,
                },
                data: { ...n.data },
            };
        });

        // Remap edge source/target to new IDs
        const newEdges: CanvasEdge[] = clipboard.edges
            .filter(e => idMapping.has(e.source) && idMapping.has(e.target))
            .map((e, i) => ({
                ...e,
                id: `edge-${now}-${i}`,
                source: idMapping.get(e.source)!,
                target: idMapping.get(e.target)!,
            }));

        return {
            ...state,
            nodes: [...state.nodes, ...newNodes],
            edges: [...state.edges, ...newEdges],
        };
    }

    undo(state: BuilderState): BuilderState {
        const pastedSet = new Set(this.pastedNodeIds);
        return {
            ...state,
            nodes: state.nodes.filter(n => !pastedSet.has(n.id)),
            edges: state.edges.filter(e => !pastedSet.has(e.source) && !pastedSet.has(e.target)),
        };
    }
}

/**
 * Duplicates selected nodes in-place with offset positions.
 */
export class DuplicateCommand implements Command {
    type = 'DUPLICATE';
    private duplicatedNodeIds: string[] = [];

    constructor(private readonly selectedNodeIds: string[]) {}

    execute(state: BuilderState): BuilderState {
        const selectedSet = new Set(this.selectedNodeIds);
        const selectedNodes = state.nodes.filter(n => selectedSet.has(n.id));
        const selectedEdges = state.edges.filter(e => selectedSet.has(e.source) && selectedSet.has(e.target));

        if (selectedNodes.length === 0) return state;

        const idMapping = new Map<string, string>();
        const now = Date.now();

        const newNodes: CanvasNode[] = selectedNodes.map((n, i) => {
            const newId = `node-${now}-${i}`;
            idMapping.set(n.id, newId);
            this.duplicatedNodeIds.push(newId);

            return {
                ...n,
                id: newId,
                position: {
                    x: n.position.x + PASTE_OFFSET.x,
                    y: n.position.y + PASTE_OFFSET.y,
                },
                data: { ...n.data, name: n.data.name ? `${n.data.name} (copy)` : undefined },
            };
        });

        const newEdges: CanvasEdge[] = selectedEdges
            .filter(e => idMapping.has(e.source) && idMapping.has(e.target))
            .map((e, i) => ({
                ...e,
                id: `edge-${now}-${i}`,
                source: idMapping.get(e.source)!,
                target: idMapping.get(e.target)!,
            }));

        return {
            ...state,
            nodes: [...state.nodes, ...newNodes],
            edges: [...state.edges, ...newEdges],
        };
    }

    undo(state: BuilderState): BuilderState {
        const dupSet = new Set(this.duplicatedNodeIds);
        return {
            ...state,
            nodes: state.nodes.filter(n => !dupSet.has(n.id)),
            edges: state.edges.filter(e => !dupSet.has(e.source) && !dupSet.has(e.target)),
        };
    }
}

/**
 * Deletes all selected nodes and their connected edges.
 */
export class DeleteSelectionCommand implements Command {
    type = 'DELETE_SELECTION';
    private deletedNodes: CanvasNode[] = [];
    private deletedEdges: CanvasEdge[] = [];

    constructor(private readonly selectedNodeIds: string[]) {}

    execute(state: BuilderState): BuilderState {
        const selectedSet = new Set(this.selectedNodeIds);

        this.deletedNodes = state.nodes.filter(n => selectedSet.has(n.id));
        this.deletedEdges = state.edges.filter(e => selectedSet.has(e.source) || selectedSet.has(e.target));

        return {
            ...state,
            nodes: state.nodes.filter(n => !selectedSet.has(n.id)),
            edges: state.edges.filter(e => !selectedSet.has(e.source) && !selectedSet.has(e.target)),
            selectedNodeId: selectedSet.has(state.selectedNodeId || '') ? null : state.selectedNodeId,
        };
    }

    undo(state: BuilderState): BuilderState {
        return {
            ...state,
            nodes: [...state.nodes, ...this.deletedNodes],
            edges: [...state.edges, ...this.deletedEdges],
        };
    }
}
