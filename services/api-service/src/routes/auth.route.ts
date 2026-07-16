import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimiter } from "../middleware/rate-limiter.middleware";

const router = Router();
const controller = new AuthController();

router.post("/register", authRateLimiter, controller.register.bind(controller));
router.post("/login", authRateLimiter, controller.login.bind(controller));
router.get("/me", authMiddleware, controller.me.bind(controller));
export default router;