/**
 * POST /api/compile
 *
 * Accepts a WorkflowDefinitionDTO, runs it through the CompilationService,
 * and returns diagnostics + compiled workflow ID.
 *
 * This endpoint is SEPARATE from /api/executions.
 * Compilation and execution are independent responsibilities.
 */

import { NextResponse } from 'next/server';
import { CompilationService } from '../../../../../../runtime/workflow/compilation-service';
import { fromDTO } from '../../../../../../runtime/workflow/workflow-definition-dto';

// In-memory compile cache (production would use Redis/persistent store)
const compileCache = new Map<string, { compiledWorkflowId: string; hash: string }>();
const compiledWorkflows = new Map<string, any>();

const compilationService = new CompilationService();

export async function POST(request: Request) {
    try {
        const dto = await request.json();

        // 1. Parse DTO → WorkflowDefinition
        const definition = fromDTO(dto);

        // 2. Compile
        const result = compilationService.compile(definition);

        if (!result.success) {
            return NextResponse.json({
                success: false,
                definitionHash: result.definitionHash,
                diagnostics: result.diagnostics,
            }, { status: 422 });
        }

        // 3. Cache the compiled workflow
        const compiledWorkflowId = `compiled-${result.definitionHash.substring(0, 12)}`;
        compiledWorkflows.set(compiledWorkflowId, result.workflow);
        compileCache.set(result.definitionHash, { compiledWorkflowId, hash: result.definitionHash });

        return NextResponse.json({
            success: true,
            compiledWorkflowId,
            definitionHash: result.definitionHash,
            diagnostics: result.diagnostics,
            taskCount: result.workflow?.tasks.size || 0,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 400 });
    }
}

/**
 * Retrieves a compiled workflow by ID (used by /api/executions).
 * Exported for internal use within the Next.js app.
 */
export function getCompiledWorkflow(compiledWorkflowId: string) {
    return compiledWorkflows.get(compiledWorkflowId);
}
