'use client';

import React, { useState, useRef } from 'react';
import { useBuilderStore, BuilderValidator, WorkflowDefinitionAdapter } from '@local/builder';
import { toDTO, fromDTO, CURRENT_SCHEMA_VERSION } from '@local/builder';
import { defaultLayoutEngine } from '@local/builder';
import { useRouter } from 'next/navigation';

export const BuilderToolbar = () => {
    const router = useRouter();
    const { undo, redo, setValidationErrors } = useBuilderStore();
    const state = useBuilderStore(s => s);
    const [compiling, setCompiling] = useState(false);
    const [running, setRunning] = useState(false);
    const [lastCompiledId, setLastCompiledId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ─── Validate (lightweight, builder-only) ───────────────────
    const handleValidate = () => {
        const errors = BuilderValidator.validate(state);
        setValidationErrors(errors);
        if (errors.length === 0) {
            alert('✅ Workflow is valid!');
        } else {
            alert(`Found ${errors.length} issue(s). Check the canvas for highlights.`);
        }
    };

    // ─── Export JSON ────────────────────────────────────────────
    const handleExport = () => {
        if (state.nodes.length === 0) {
            alert('Nothing to export — add some nodes first.');
            return;
        }

        const definition = WorkflowDefinitionAdapter.serialize(
            `workflow-${Date.now()}`,
            'Exported Workflow',
            state
        );
        const dto = toDTO(definition);
        const json = JSON.stringify(dto, null, 2);

        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${definition.id}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ─── Import JSON ────────────────────────────────────────────
    const handleImport = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const dto = JSON.parse(text);

            if (!dto.schemaVersion) {
                alert('Invalid workflow file: missing schemaVersion.');
                return;
            }

            const definition = fromDTO(dto);
            let imported = WorkflowDefinitionAdapter.deserialize(definition);

            // Apply auto-layout if no saved positions
            if (WorkflowDefinitionAdapter.needsAutoLayout(imported)) {
                imported = defaultLayoutEngine.layout(imported);
            }

            // Load into store by dispatching a full state replacement
            // (This bypasses the command pattern intentionally — import is not undoable)
            useBuilderStore.setState({
                nodes: imported.nodes,
                edges: imported.edges,
                selectedNodeId: null,
                validationErrors: [],
            });

            alert(`✅ Imported ${imported.nodes.length} tasks from "${definition.name}"`);
        } catch (err: any) {
            alert(`Import failed: ${err.message}`);
        }

        // Reset file input
        event.target.value = '';
    };

    // ─── Compile ────────────────────────────────────────────────
    const handleCompile = async () => {
        if (state.nodes.length === 0) {
            alert('Nothing to compile — add some nodes first.');
            return;
        }

        setCompiling(true);
        try {
            const definition = WorkflowDefinitionAdapter.serialize(
                `workflow-${Date.now()}`,
                'Builder Workflow',
                state
            );
            const dto = toDTO(definition);

            const res = await fetch('/api/compile', {
                method: 'POST',
                body: JSON.stringify(dto),
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json();

            if (data.success) {
                setLastCompiledId(data.compiledWorkflowId);
                const warnings = data.diagnostics.filter((d: any) => d.severity === 'warning');
                if (warnings.length > 0) {
                    alert(`✅ Compiled successfully (${data.taskCount} tasks)\n\n⚠️ ${warnings.length} warning(s):\n${warnings.map((w: any) => `• ${w.message}`).join('\n')}`);
                } else {
                    alert(`✅ Compiled successfully!\n\nTasks: ${data.taskCount}\nHash: ${data.definitionHash.substring(0, 12)}...`);
                }
            } else {
                const errors = data.diagnostics.filter((d: any) => d.severity === 'error');
                alert(`❌ Compilation failed:\n\n${errors.map((e: any) => `• ${e.message}`).join('\n')}`);
            }
        } catch (err: any) {
            alert(`Compile request failed: ${err.message}`);
        } finally {
            setCompiling(false);
        }
    };

    // ─── Run (compile first, then execute) ──────────────────────
    const handleRun = async () => {
        if (state.nodes.length === 0) {
            alert('Nothing to run — add some nodes first.');
            return;
        }

        setRunning(true);
        try {
            // Step 1: Compile
            const definition = WorkflowDefinitionAdapter.serialize(
                `workflow-${Date.now()}`,
                'Builder Workflow',
                state
            );
            const dto = toDTO(definition);

            const compileRes = await fetch('/api/compile', {
                method: 'POST',
                body: JSON.stringify(dto),
                headers: { 'Content-Type': 'application/json' },
            });
            const compileData = await compileRes.json();

            if (!compileData.success) {
                const errors = compileData.diagnostics.filter((d: any) => d.severity === 'error');
                alert(`❌ Cannot run — compilation failed:\n\n${errors.map((e: any) => `• ${e.message}`).join('\n')}`);
                return;
            }

            setLastCompiledId(compileData.compiledWorkflowId);

            // Step 2: Execute
            const execRes = await fetch('/api/execute', {
                method: 'POST',
                body: JSON.stringify({ compiledWorkflowId: compileData.compiledWorkflowId }),
                headers: { 'Content-Type': 'application/json' },
            });
            const execData = await execRes.json();

            if (execRes.ok) {
                router.push(`/executions/${execData.executionId}`);
            } else {
                alert(`Execution failed: ${execData.error}`);
            }
        } catch (err: any) {
            alert(`Run request failed: ${err.message}`);
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="h-14 bg-white border-b flex items-center px-4 justify-between shadow-sm z-20 relative">
            <div className="font-bold text-lg text-slate-800">Visual Builder</div>
            <div className="flex gap-2 items-center">
                {/* History */}
                <button onClick={undo} className="px-3 py-1.5 bg-slate-100 border rounded hover:bg-slate-200 text-sm font-medium cursor-pointer" title="Undo (Ctrl+Z)">Undo</button>
                <button onClick={redo} className="px-3 py-1.5 bg-slate-100 border rounded hover:bg-slate-200 text-sm font-medium cursor-pointer" title="Redo (Ctrl+Shift+Z)">Redo</button>
                
                <div className="w-px h-6 bg-slate-200" />

                {/* Export / Import */}
                <button onClick={handleExport} className="px-3 py-1.5 bg-slate-100 border rounded hover:bg-slate-200 text-sm font-medium cursor-pointer">Export</button>
                <button onClick={handleImport} className="px-3 py-1.5 bg-slate-100 border rounded hover:bg-slate-200 text-sm font-medium cursor-pointer">Import</button>
                <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />
                
                <div className="w-px h-6 bg-slate-200" />

                {/* Validate / Compile / Run */}
                <button onClick={handleValidate} className="px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded hover:bg-blue-100 text-sm font-medium cursor-pointer">Validate</button>
                <button onClick={handleCompile} disabled={compiling} className="px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded hover:bg-amber-100 text-sm font-medium disabled:opacity-50 cursor-pointer">
                    {compiling ? 'Compiling...' : 'Compile'}
                </button>
                <button onClick={handleRun} disabled={running} className="px-4 py-1.5 bg-green-600 text-white font-medium rounded hover:bg-green-700 text-sm disabled:opacity-50 cursor-pointer">
                    {running ? 'Running...' : 'Run'}
                </button>
            </div>
        </div>
    );
};
