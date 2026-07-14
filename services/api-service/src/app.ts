import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import healthRoute from "./routes/healt.route"
import authRoute from "./routes/auth.route";
import jobRoutes from "./routes/job.route";
import metricsRoutes from "./routes/metrics.route";
import { register } from "./metrics/metrics";
const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.use("/health", healthRoute);
app.use("/auth",authRoute);
app.use("/jobs",jobRoutes);
app.use("/metrics",metricsRoutes);



export default app;