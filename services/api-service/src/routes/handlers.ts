import { Router, Request, Response } from 'express';
import { DiscoveryService } from '../../../../runtime/discovery/discovery.service';

// Assuming DiscoveryService is instantiated and injected
declare const discoveryService: DiscoveryService;

export const handlersRouter = Router();

/**
 * GET /handlers
 * Returns a list of all registered HandlerDefinitions, including their 
 * JSON Schemas and feature flags. Supports capability filtering.
 */
handlersRouter.get('/', (req: Request, res: Response) => {
    try {
        const category = req.query.category as string;
        const handlers = discoveryService.listHandlers(category);
        
        return res.status(200).json({
            platformVersion: "1.0",
            capabilities: ["HTTP_AUTH_PROVIDERS", "SCHEDULER_DELAY"],
            handlers: handlers,
            count: handlers.length
        });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to discover handlers' });
    }
});

/**
 * GET /handlers/:id/:version
 * Returns the definition for a specific handler version.
 */
handlersRouter.get('/:id/:version', (req: Request, res: Response) => {
    try {
        const identifier = `${req.params.id}@${req.params.version}`;
        const registry = HandlerRegistry.getInstance();
        const definition = registry.getDefinition(identifier);
        
        if (!definition) {
            return res.status(404).json({ error: `Handler ${identifier} not found` });
        }
        
        return res.status(200).json({ data: definition });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to retrieve handler definition' });
    }
});

/**
 * GET /handlers/categories
 * Returns all active categories available on the platform.
 */
handlersRouter.get('/categories', (req: Request, res: Response) => {
    return res.status(200).json({
        data: ['trigger', 'core', 'integration', 'utility', 'script', 'internal', 'experimental']
    });
});
