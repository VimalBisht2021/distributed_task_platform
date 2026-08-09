'use client';

import React from 'react';
import { pluginRegistry } from '@local/builder';
import '@local/builder'; // Ensure registered

const categoryLabels: Record<string, string> = {
    triggers: '⚡ Triggers',
    actions: '🔧 Actions',
    logic: '🔀 Logic',
    integrations: '🔌 Integrations',
};

const categoryOrder = ['triggers', 'logic', 'actions', 'integrations'];

export const PluginPalette = () => {
    const allPlugins = pluginRegistry.getAll();

    const onDragStart = (event: React.DragEvent, pluginId: string, name: string) => {
        event.dataTransfer.setData('application/reactflow/pluginId', pluginId);
        event.dataTransfer.setData('application/reactflow/name', name);
        event.dataTransfer.effectAllowed = 'move';
    };

    // Group by category
    const grouped = categoryOrder
        .map(cat => ({
            category: cat,
            label: categoryLabels[cat] || cat,
            plugins: allPlugins.filter(p => p.category === cat),
        }))
        .filter(g => g.plugins.length > 0);

    return (
        <aside className="w-64 bg-white border-r flex flex-col p-4 shadow-sm z-10 relative overflow-y-auto">
            <h2 className="font-semibold mb-4 text-slate-700">Plugins</h2>
            {grouped.map(group => (
                <div key={group.category} className="mb-4">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        {group.label}
                    </div>
                    <div className="flex flex-col gap-1.5">
                        {group.plugins.map(plugin => (
                            <div
                                key={plugin.id}
                                className={`p-2.5 ${plugin.color.bg} border ${plugin.color.border} rounded cursor-grab hover:opacity-80 transition-opacity text-sm ${plugin.color.text} font-medium`}
                                onDragStart={(e) => onDragStart(e, plugin.id, plugin.name)}
                                draggable
                            >
                                {plugin.name}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </aside>
    );
};
