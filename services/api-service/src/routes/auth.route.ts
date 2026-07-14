import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { authMiddleware } from "../middleware/auth.middleware";
const router = Router();
const controller = new AuthController();

router.post("/register",controller.register.bind(controller));
router.post("/login",controller.login.bind(controller));
router.get("/me",authMiddleware,controller.me.bind(controller));
export default router;