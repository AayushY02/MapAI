import { mapLinePolygonMeshes } from "./mapMeshes.js";
import { pool } from "./index.js";

mapLinePolygonMeshes()
  .then(() => {
    console.log("Mesh mapping complete");
  })
  .catch((error) => {
    console.error("Mesh mapping failed", error);
    process.exitCode = 1;
  })
  .finally(() => {
    pool.end();
  });
