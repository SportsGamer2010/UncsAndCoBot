import http from "node:http";

export function startHealthServer(port = process.env.PORT): http.Server | undefined {
  if (!port) {
    return undefined;
  }

  const server = http.createServer((request, response) => {
    const path = request.url?.split("?")[0];
    if (path === "/health" || path === "/") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }

    response.writeHead(404);
    response.end();
  });

  server.listen(Number(port), "0.0.0.0", () => {
    console.log(`Health server listening on 0.0.0.0:${port}`);
  });

  server.on("error", (error) => {
    console.error("Health server failed:", error);
  });

  return server;
}
