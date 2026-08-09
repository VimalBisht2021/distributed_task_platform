'use client';

import React from 'react';
import { BuilderToolbar } from '../../components/Builder/Toolbar/BuilderToolbar';
import { PluginPalette } from '@local/builder';
import { PropertyPanel } from '@local/builder';
import { WorkflowCanvas } from '@local/builder';
import { ReactFlowProvider } from '@xyflow/react';

export default function BuilderPage() {
    return (
        <div className="h-screen w-screen flex flex-col bg-slate-50 overflow-hidden text-slate-900">
            <BuilderToolbar />
            <div className="flex-1 flex flex-row overflow-hidden relative">
                <PluginPalette />
                
                <main className="flex-1 relative h-full">
                    <ReactFlowProvider>
                        <WorkflowCanvas />
                    </ReactFlowProvider>
                </main>
                
                <PropertyPanel />
            </div>
        </div>
    );
}
