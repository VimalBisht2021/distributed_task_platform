import { Router } from "express";
import { getJobs, getWorkers } from "../controllers/metrics.controller";
import { register } from "../metrics/metrics";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();
router.get("/jobs", authMiddleware, getJobs);

router.get("/workers", authMiddleware, getWorkers);


router.get("/", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

export default router;
