export interface CanvasNode {
    id: string;          // Purely canvas/UI ID
    pluginId: string;    // Plugin reference (e.g. 'core/http', 'core/condition')
    position: { x: number; y: number };
    data: {
        name?: string;
        [key: string]: any; // plugin-specific config
    };
}

export interface CanvasEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    label?: string; // For conditional branching visually
}

export interface BuilderState {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
    selectedNodeId: string | null;
    validationErrors: Array<{ nodeId: string; message: string }>;
}
