import { Command } from './Command';
import { BuilderState, CanvasNode } from '../state/builder-state';

export class AddNodeCommand implements Command {
    type = 'ADD_NODE';
    constructor(private readonly node: CanvasNode) {}

    execute(state: BuilderState): BuilderState {
        return {
            ...state,
            nodes: [...state.nodes, this.node],
        };
    }

    undo(state: BuilderState): BuilderState {
        return {
            ...state,
            nodes: state.nodes.filter((n) => n.id !== this.node.id),
        };
    }
}

export class DeleteNodeCommand implements Command {
    type = 'DELETE_NODE';
    private nodeIndex = -1;
    private deletedNode: CanvasNode | null = null;
    private deletedEdges: any[] = [];

    constructor(private readonly nodeId: string) {}

    execute(state: BuilderState): BuilderState {
        this.nodeIndex = state.nodes.findIndex(n => n.id === this.nodeId);
        if (this.nodeIndex === -1) return state;

        this.deletedNode = state.nodes[this.nodeIndex];
        this.deletedEdges = state.edges.filter(e => e.source === this.nodeId || e.target === this.nodeId);

        return {
            ...state,
            nodes: state.nodes.filter(n => n.id !== this.nodeId),
            edges: state.edges.filter(e => e.source !== this.nodeId && e.target !== this.nodeId),
            selectedNodeId: state.selectedNodeId === this.nodeId ? null : state.selectedNodeId,
        };
    }

    undo(state: BuilderState): BuilderState {
        if (!this.deletedNode) return state;
        
        const newNodes = [...state.nodes];
        newNodes.splice(this.nodeIndex, 0, this.deletedNode);

        return {
            ...state,
            nodes: newNodes,
            edges: [...state.edges, ...this.deletedEdges],
        };
    }
}

export class MoveNodeCommand implements Command {
    type = 'MOVE_NODE';
    constructor(
        private readonly nodeId: string,
        private readonly newPosition: { x: number, y: number },
        private readonly oldPosition: { x: number, y: number }
    ) {}

    execute(state: BuilderState): BuilderState {
        return {
            ...state,
            nodes: state.nodes.map(n => n.id === this.nodeId ? { ...n, position: this.newPosition } : n)
        };
    }

    undo(state: BuilderState): BuilderState {
        return {
            ...state,
            nodes: state.nodes.map(n => n.id === this.nodeId ? { ...n, position: this.oldPosition } : n)
        };
    }
}

export class UpdatePropertyCommand implements Command {
    type = 'UPDATE_PROPERTY';
    constructor(
        private readonly nodeId: string,
        private readonly properties: Record<string, any>,
        private readonly oldProperties: Record<string, any>
    ) {}

    execute(state: BuilderState): BuilderState {
        return {
            ...state,
            nodes: state.nodes.map(n => 
                n.id === this.nodeId 
                    ? { ...n, data: { ...n.data, ...this.properties } } 
                    : n
            )
        };
    }

    undo(state: BuilderState): BuilderState {
        return {
            ...state,
            nodes: state.nodes.map(n => 
                n.id === this.nodeId 
                    ? { ...n, data: { ...n.data, ...this.oldProperties } } 
                    : n
            )
        };
    }
}
