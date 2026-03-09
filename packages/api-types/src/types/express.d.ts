/**
 * Global Express augmentation: Request.user is the full Prisma User after requireAuth.
 */
import type { User } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export {};
