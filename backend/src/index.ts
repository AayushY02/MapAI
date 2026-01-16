import "dotenv/config";
import express from "express";
import cors from "cors";
import meshRoutes from "./routes/mesh.js";

const app = express();
const port = Number(process.env.PORT) || 4000;

const origins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
  : ["http://localhost:5173"];

app.use(
  cors({
    origin: origins,
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/mesh", meshRoutes);

app.listen(port, () => {
  console.log(`MapAI backend listening on port ${port}`);
});
