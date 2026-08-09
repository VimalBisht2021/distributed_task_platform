'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ReactFlow, Background, Controls, NodeChange, EdgeChange, Connection, Node, Edge, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useBuilderStore } from '@local/builder';
import { AddNodeCommand, MoveNodeCommand } from '@local/builder';
import { ConnectEdgeCommand, DisconnectEdgeCommand } from '@local/builder';
import { CopySelectionCommand, PasteCommand, DuplicateCommand, DeleteSelectionCommand } from '@local/builder';
import { PluginNode } from '../Nodes/PluginNode';

const nodeTypes = {
    plugin: PluginNode,
};

export const WorkflowCanvas = () => {
    const { nodes, edges, dispatch, selectNode, undo, redo } = useBuilderStore();
    const { screenToFlowPosition } = useReactFlow();
    const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

    // Map Domain Nodes to ReactFlow Nodes
    const rfNodes: Node[] = nodes.map(n => ({
        id: n.id,
        type: 'plugin',
        position: n.position,
        data: { ...n.data, pluginId: n.pluginId }
    }));

    // Map Domain Edges to ReactFlow Edges
    const rfEdges: Edge[] = edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        label: e.label,
    }));

    const onNodesChange = useCallback((changes: NodeChange[]) => {
        // Real-time dragging handled by onNodeDragStop for undo/redo
    }, []);

    const onNodeDragStop = useCallback((event: any, node: Node) => {
        const domainNode = nodes.find(n => n.id === node.id);
        if (domainNode && node.position) {
            dispatch(new MoveNodeCommand(node.id, node.position, domainNode.position));
        }
    }, [nodes, dispatch]);

    const onConnect = useCallback((connection: Connection) => {
        if (connection.source && connection.target) {
            dispatch(new ConnectEdgeCommand({
                id: `edge-${Date.now()}`,
                source: connection.source,
                target: connection.target,
                sourceHandle: connection.sourceHandle || undefined,
                targetHandle: connection.targetHandle || undefined,
                label: connection.sourceHandle || undefined
            }));
        }
    }, [dispatch]);

    const onEdgesDelete = useCallback((deletedEdges: Edge[]) => {
        deletedEdges.forEach(e => {
            dispatch(new DisconnectEdgeCommand(e.id));
        });
    }, [dispatch]);

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();

        const pluginId = event.dataTransfer.getData('application/reactflow/pluginId');
        const name = event.dataTransfer.getData('application/reactflow/name');
        if (!pluginId) return;

        const position = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });

        dispatch(new AddNodeCommand({
            id: `node-${Date.now()}`,
            pluginId,
            position,
            data: { name }
        }));
    }, [dispatch, screenToFlowPosition]);

    const onSelectionChange = useCallback((params: { nodes: Node[] }) => {
        const ids = params.nodes.map(n => n.id);
        setSelectedNodeIds(ids);
        selectNode(ids.length === 1 ? ids[0] : null);
    }, [selectNode]);

    // ─── Keyboard Shortcuts ─────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't trigger shortcuts when typing in inputs/textareas
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

            const isCtrl = e.ctrlKey || e.metaKey;

            // Ctrl+Z → Undo
            if (isCtrl && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            }
            // Ctrl+Shift+Z or Ctrl+Y → Redo
            if (isCtrl && (e.key === 'Z' || e.key === 'y')) {
                e.preventDefault();
                redo();
            }
            // Ctrl+C → Copy
            if (isCtrl && e.key === 'c') {
                e.preventDefault();
                if (selectedNodeIds.length > 0) {
                    dispatch(new CopySelectionCommand(selectedNodeIds));
                }
            }
            // Ctrl+V → Paste
            if (isCtrl && e.key === 'v') {
                e.preventDefault();
                dispatch(new PasteCommand());
            }
            // Ctrl+D → Duplicate
            if (isCtrl && e.key === 'd') {
                e.preventDefault();
                if (selectedNodeIds.length > 0) {
                    dispatch(new DuplicateCommand(selectedNodeIds));
                }
            }
            // Delete / Backspace → Delete selection
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedNodeIds.length > 0) {
                    e.preventDefault();
                    dispatch(new DeleteSelectionCommand(selectedNodeIds));
                }
            }
            // Ctrl+A → Select all (handled by ReactFlow natively)
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo, dispatch, selectedNodeIds]);

    return (
        <div className="w-full h-full bg-slate-50" onDragOver={onDragOver} onDrop={onDrop}>
            <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onNodeDragStop={onNodeDragStop}
                onConnect={onConnect}
                onEdgesDelete={onEdgesDelete}
                onSelectionChange={onSelectionChange}
                selectNodesOnDrag={false}
                fitView
                deleteKeyCode={null} // We handle delete ourselves
            >
                <Background />
                <Controls />
            </ReactFlow>
        </div>
    );
};
