import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt.util";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import logger from "../utils/logger";
import { AuthRequest, AuthenticatedRequest, JwtPayload } from "../types/auth.types";

// Re-export UserRole for backwards compatibility
export { UserRole };

// Export AuthRequest and AuthenticatedRequest type for use in routes
export { AuthRequest, AuthenticatedRequest };

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Middleware to authenticate user via JWT token
 */
export const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const requestId = (req as any).requestId;
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "No token provided" });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const decoded = verifyToken(token) as any;

    if (!decoded) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    // Get user from database to check role
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        walletAddress: true,
        role: true,
      },
    });

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    // Attach user to request
    req.user = {
      userId: user.id,
      walletAddress: user.walletAddress,
      role: user.role,
    };

    next();
  } catch (error) {
    logger.error("Authentication error:", { error, requestId });
    res.status(401).json({ error: "Authentication failed" });
  }
};

// Alias for backwards compatibility
export const authenticateToken = authenticateUser;

/**
 * Middleware to optionally authenticate user via JWT token.
 * If a Bearer token is provided and valid, attaches `req.user`; otherwise continues unauthenticated.
 */
export const optionalAuthentication = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      next();
      return;
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
      next();
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        walletAddress: true,
        role: true,
      },
    });

    if (user) {
      req.user = {
        userId: user.id,
        walletAddress: user.walletAddress,
        role: user.role,
      };
    }

    next();
  } catch (error) {
    // Optional auth should never block the request
    next();
  }
};

/**
 * Middleware to require admin role
 */
export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const requestId = (req as any).requestId;
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "No token provided" });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, walletAddress: true, role: true },
    });

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    if (user.role !== UserRole.ADMIN) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    req.user = {
      userId: user.id,
      walletAddress: user.walletAddress,
      role: user.role,
    };

    next();
  } catch (error) {
    logger.error("Admin authentication error:", { error, requestId });
    res.status(401).json({ error: "Authentication failed" });
  }
};

/**
 * Middleware to require oracle role
 */
export const requireOracle = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const requestId = (req as any).requestId;
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "No token provided" });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, walletAddress: true, role: true },
    });

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    if (user.role !== UserRole.ORACLE && user.role !== UserRole.ADMIN) {
      res.status(403).json({ error: "Oracle or Admin access required" });
      return;
    }

    req.user = {
      userId: user.id,
      walletAddress: user.walletAddress,
      role: user.role,
    };

    next();
  } catch (error) {
    logger.error("Oracle authentication error:", { error, requestId });
    res.status(401).json({ error: "Authentication failed" });
  }
};
