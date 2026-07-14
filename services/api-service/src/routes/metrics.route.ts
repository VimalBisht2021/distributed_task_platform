import { Router } from "express";
import { getJobs, getWorkers } from "../controllers/metrics.controller";
import { register } from "../metrics/metrics";
const router = Router();
router.get("/jobs", getJobs);

router.get("/workers", getWorkers);


router.get("/", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

export default router;
