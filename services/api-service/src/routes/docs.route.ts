import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import swaggerJSDoc from "swagger-jsdoc";

const router = Router();

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Distributed Task Platform API",
      version: "1.0.0",
      description: "API for submitting and managing distributed workflows",
    },
    servers: [
      {
        url: "http://localhost:3000",
      },
    ],
  },
  apis: ["./src/routes/*.ts"], // Path to the API docs
};

const swaggerSpec = swaggerJSDoc(options);

router.use("/", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

export default router;
