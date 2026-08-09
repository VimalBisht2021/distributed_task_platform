import { Command } from './Command';
import { BuilderState, CanvasEdge } from '../state/builder-state';

export class ConnectEdgeCommand implements Command {
    type = 'CONNECT_EDGE';
    constructor(private readonly edge: CanvasEdge) {}

    execute(state: BuilderState): BuilderState {
        return {
            ...state,
            edges: [...state.edges, this.edge]
        };
    }

    undo(state: BuilderState): BuilderState {
        return {
            ...state,
            edges: state.edges.filter(e => e.id !== this.edge.id)
        };
    }
}

export class DisconnectEdgeCommand implements Command {
    type = 'DISCONNECT_EDGE';
    private edgeIndex = -1;
    private deletedEdge: CanvasEdge | null = null;

    constructor(private readonly edgeId: string) {}

    execute(state: BuilderState): BuilderState {
        this.edgeIndex = state.edges.findIndex(e => e.id === this.edgeId);
        if (this.edgeIndex === -1) return state;

        this.deletedEdge = state.edges[this.edgeIndex];
        return {
            ...state,
            edges: state.edges.filter(e => e.id !== this.edgeId)
        };
    }

    undo(state: BuilderState): BuilderState {
        if (!this.deletedEdge) return state;
        const newEdges = [...state.edges];
        newEdges.splice(this.edgeIndex, 0, this.deletedEdge);
        return {
            ...state,
            edges: newEdges
        };
    }
}
