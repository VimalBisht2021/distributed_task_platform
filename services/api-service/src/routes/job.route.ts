import { Router } from "express";
import { JobController } from "../controllers/job.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

const controller = new JobController();

router.post("/", authMiddleware, controller.create.bind(controller));

router.get("/", authMiddleware, controller.getAll.bind(controller));
router.post(
  "/:jobId/cancel",
  authMiddleware,
  controller.cancel.bind(controller),
);
router.post("/:jobId/retry", authMiddleware, controller.retry.bind(controller));

router.get("/:jobId", authMiddleware, controller.getById.bind(controller));

export default router;
