/**
 * Global Express augmentation: Request.user is typed; use after requireAuth.
 */
declare global {
  namespace Express {
    interface User {
      id: string;
    }
    interface Request {
      user?: User;
    }
  }
}

export {};
