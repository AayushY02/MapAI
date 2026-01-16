import { Router } from "express";
import { inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  lineFeatures,
  meshIndex,
  pointFeatures,
  polygonFeatures,
} from "../db/schema.js";

const router = Router();

router.post("/lookup", async (req, res) => {
  const meshIds = req.body?.meshIds;

  if (!Array.isArray(meshIds) || meshIds.some((id) => typeof id !== "string")) {
    return res.status(400).json({ error: "meshIds must be an array of strings" });
  }

  if (meshIds.length === 0) {
    return res.json({ meshes: [] });
  }

  const uniqueMeshIds = Array.from(new Set(meshIds));

  try {
    const meshRows = await db
      .select()
      .from(meshIndex)
      .where(inArray(meshIndex.meshId, uniqueMeshIds));

    const [points, lines, polygons] = await Promise.all([
      db
        .select()
        .from(pointFeatures)
        .where(inArray(pointFeatures.meshId, uniqueMeshIds)),
      db
        .select()
        .from(lineFeatures)
        .where(inArray(lineFeatures.meshId, uniqueMeshIds)),
      db
        .select()
        .from(polygonFeatures)
        .where(inArray(polygonFeatures.meshId, uniqueMeshIds)),
    ]);

    const meshMap = new Map(
      meshRows.map((row) => [
        row.meshId,
        {
          meshId: row.meshId,
          presence: {
            points: row.hasPoints,
            lines: row.hasLines,
            polygons: row.hasPolygons,
          },
          points: [] as typeof points,
          lines: [] as typeof lines,
          polygons: [] as typeof polygons,
        },
      ])
    );

    uniqueMeshIds.forEach((meshId) => {
      if (!meshMap.has(meshId)) {
        meshMap.set(meshId, {
          meshId,
          presence: { points: false, lines: false, polygons: false },
          points: [] as typeof points,
          lines: [] as typeof lines,
          polygons: [] as typeof polygons,
        });
      }
    });

    points.forEach((point) => {
      const entry = meshMap.get(point.meshId);
      if (entry) {
        entry.points.push(point);
      }
    });

    lines.forEach((line) => {
      const entry = meshMap.get(line.meshId);
      if (entry) {
        entry.lines.push(line);
      }
    });

    polygons.forEach((polygon) => {
      const entry = meshMap.get(polygon.meshId);
      if (entry) {
        entry.polygons.push(polygon);
      }
    });

    return res.json({ meshes: Array.from(meshMap.values()) });
  } catch (error) {
    console.error("Mesh lookup failed", error);
    return res.status(500).json({ error: "Failed to fetch mesh data" });
  }
});

export default router;
