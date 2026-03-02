import express from "express";
import path from "node:path";

const app = express();
const port = Number(process.env.PORT ?? 4174);
const docsPath = path.resolve("docs/api-shapes");

app.use(express.static(docsPath));

app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(docsPath, "index.html"));
});

app.listen(port, () => {
  console.log(`API Shape Explorer serving ${docsPath} on ${port}`);
});
