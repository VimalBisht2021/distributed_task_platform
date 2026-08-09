'use client';

import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { pluginRegistry } from '@local/builder';
import '@local/builder'; // Ensure registered

export const PluginNode = ({ id, data, isConnectable }: NodeProps) => {
    const pluginId = data.pluginId as string;
    const manifest = pluginRegistry.get(pluginId);

    // Derive colors from manifest, fallback for unknown plugins
    const bg = manifest?.color.bg || 'bg-gray-100';
    const border = manifest?.color.border || 'border-gray-500';
    const text = manifest?.color.text || 'text-gray-900';
    const colorClass = `${bg} ${border} ${text}`;

    // Derive handles from manifest
    const outputs = manifest?.handles.outputs || ['default'];
    const hasMultipleOutputs = outputs.length > 1;

    return (
        <div className={`px-4 py-2 shadow-md rounded-md border-2 ${colorClass} min-w-[150px]`}>
            {/* Input Handle */}
            <Handle type="target" position={Position.Top} isConnectable={isConnectable} />
            
            <div className="font-bold text-sm mb-1">
                {String(data.name || manifest?.name || pluginId.replace('core/', ''))}
            </div>
            
            {/* Output Handles — generated from manifest */}
            {hasMultipleOutputs ? (
                <>
                    {outputs.map((handleId, index) => {
                        const leftPercent = ((index + 1) / (outputs.length + 1)) * 100;
                        return (
                            <React.Fragment key={handleId}>
                                <Handle
                                    type="source"
                                    position={Position.Bottom}
                                    id={handleId}
                                    style={{ left: `${leftPercent}%` }}
                                    isConnectable={isConnectable}
                                />
                                <div
                                    className="text-[10px] absolute"
                                    style={{ bottom: '-15px', left: `${leftPercent - 5}%` }}
                                >
                                    {handleId.charAt(0).toUpperCase() + handleId.slice(1)}
                                </div>
                            </React.Fragment>
                        );
                    })}
                </>
            ) : (
                <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} />
            )}
        </div>
    );
};
