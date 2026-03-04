import express from "express";
import fs from "node:fs";
import path from "node:path";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const distPath = path.resolve("apps/client/dist");

app.use(express.static(distPath));

app.get("/assets/{*path}", (req, res, next) => {
  const rawPath = Array.isArray(req.params.path) ? req.params.path.join("/") : String(req.params.path ?? "");
  const candidate = rawPath.replace(/ /g, "+");
  if (candidate === rawPath) return next();

  const resolved = path.resolve(distPath, "assets", candidate);
  const normalizedAssetsRoot = path.resolve(distPath, "assets") + path.sep;
  if (!resolved.startsWith(normalizedAssetsRoot) || !fs.existsSync(resolved)) {
    return next();
  }

  return res.sendFile(resolved);
});

app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, () => {
  console.log(`Web serving ${distPath} on ${port}`);
});
