import { Router } from "express";
import { JobController } from "../controllers/job.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { jobCreationRateLimiter, apiRateLimiter } from "../middleware/rate-limiter.middleware";

const router = Router();

const controller = new JobController();

router.post("/", authMiddleware, jobCreationRateLimiter, controller.create.bind(controller));

router.get("/", authMiddleware, apiRateLimiter, controller.getAll.bind(controller));
router.post(
  "/:jobId/cancel",
  authMiddleware,
  controller.cancel.bind(controller),
);
router.post("/:jobId/retry", authMiddleware, controller.retry.bind(controller));

router.get("/:jobId", authMiddleware, apiRateLimiter, controller.getById.bind(controller));
router.get("/:jobId/result", authMiddleware, apiRateLimiter, controller.getResult.bind(controller));

export default router;
