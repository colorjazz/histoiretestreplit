// Serveur local qui exécute les fonctions Netlify sans installer netlify-cli.
// Usage : GEMINI_API_KEY=... npm run dev:api   puis, dans un autre terminal : npm run dev
// Les jobs sont gardés en mémoire (Netlify Blobs n'est utilisé qu'une fois déployé).
import http from "node:http";

const port = Number(process.env.API_PORT || 8888);
const load = async (name) => (await import(`../netlify/functions/${name}.mts`)).default;
const focusTraining = await load("focus-training");
const focusTrainingJob = await load("focus-training-job");
const worker = await load("focus-training-worker-background");
const visuals = await load("historical-visuals");

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const url = new URL(req.url || "/", `http://localhost:${port}`);
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: ["GET", "HEAD"].includes(req.method || "") ? undefined : Buffer.concat(chunks),
  });
  let response;
  try {
    const job = url.pathname.match(/^\/api\/focus-training\/jobs\/([^/]+)$/);
    if (url.pathname === "/api/focus-training") {
      response = await focusTraining(request);
    } else if (url.pathname.startsWith("/api/historical-visuals")) {
      response = await visuals(request);
    } else if (job) {
      response = await focusTrainingJob(request, { params: { jobId: job[1] } });
    } else if (url.pathname === "/.netlify/functions/focus-training-worker-background") {
      // Comme Netlify : réponse 202 immédiate, travail en arrière-plan.
      void worker(request).catch((error) => console.error("worker", error));
      response = new Response(null, { status: 202 });
    } else {
      response = new Response(JSON.stringify({ error: "Route non disponible." }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error(error);
    response = new Response(JSON.stringify({ error: "Erreur interne." }), { status: 500 });
  }
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
  if (!url.pathname.includes("/jobs/")) console.log(req.method, url.pathname, response.status);
}).listen(port, () => console.log(`API locale sur http://localhost:${port}`));
