import express from "express";
import path from "node:path";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const distPath = path.resolve("apps/client/dist");

app.use(express.static(distPath));

app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, () => {
  console.log(`Web serving ${distPath} on ${port}`);
});
