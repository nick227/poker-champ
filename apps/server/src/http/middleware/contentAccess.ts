import { Request, Response, NextFunction } from 'express';

// Middleware for admin content management
export function requireContentAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required for content management' });
  }

  next();
}
