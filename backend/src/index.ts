import app from "./app";

const port = Number(process.env["PORT"] ?? 8080);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
}

app.listen(port, "0.0.0.0", () => {
  console.log(`[api-server] listening on 0.0.0.0:${port}`);
});
