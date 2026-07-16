import { Router, Request, Response } from "express";
import { EventService } from "../services/event.service";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();
const eventService = new EventService();

router.get("/stream", authMiddleware, (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Send initial keepalive
  res.write(": keepalive\n\n");

  const keepAliveInterval = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 20000); // 20s keepalive

  const unsubscribe = eventService.subscribeToEvents((event) => {
    console.log(`[SSE ROUTE] Sending event to client:`, event.type);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  req.on("close", () => {
    clearInterval(keepAliveInterval);
    unsubscribe();
  });
});

router.get("/recovery", authMiddleware, async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const events = await eventService.getRecentRecoveryEvents(limit);
    
    return res.status(200).json(events.map(e => ({
      id: e.id,
      jobId: e.jobId,
      eventType: e.eventType,
      workerId: e.workerId || undefined,
      details: e.details,
      createdAt: e.createdAt,
      jobType: (e as any).job?.jobType
    })));
  } catch (error: any) {
    return res.status(500).json({
      message: error.message,
    });
  }
});

export default router;
