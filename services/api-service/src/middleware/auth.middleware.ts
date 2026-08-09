import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const authenticateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey === process.env.API_KEY) {
    req.user = {
      userId: 'system',
      email: 'system@dtp.local',
      role: 'ADMIN',
    };
    return next();
  }
  return res.status(401).json({ message: "Invalid API Key" });
};

const authenticateJwt = (req: Request, res: Response, next: NextFunction) => {
  let token = "";
  
  if (req.headers.authorization) {
    const authHeader = req.headers.authorization;
    const [bearer, tokenValue] = authHeader.split(" ");
    if (bearer !== "Bearer" || !tokenValue) {
      return res.status(401).json({ message: "Invalid authorization header" });
    }
    token = tokenValue;
  } else if (req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    return res.status(401).json({
      message: "No token provided",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
      email: string;
      role: string;
    };
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid token",
    });
  }
};

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const hasApiKey = !!req.headers['x-api-key'];
  
  if (hasApiKey) {
    return authenticateApiKey(req, res, next);
  }
  
  return authenticateJwt(req, res, next);
};
