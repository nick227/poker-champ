declare module "express-openapi-validator" {
  type MiddlewareOptions = {
    apiSpec: string | Record<string, unknown>;
    validateRequests?: boolean;
    validateResponses?: boolean;
  };

  const OpenApiValidator: {
    middleware(options: MiddlewareOptions): import("express").RequestHandler;
  };

  export default OpenApiValidator;
}

