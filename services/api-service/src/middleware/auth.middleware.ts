import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
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

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
      email: string;
      role: string;
    };
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid token",
    });
  }
};
