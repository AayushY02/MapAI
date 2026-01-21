import { Router } from "express";
import { inArray } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { layerRegistry, meshIndex } from "../db/schema.js";

const router = Router();

type LayerEntry = {
  id: string;
  type: "point" | "line" | "polygon";
  features: Array<{
    id: number;
    meshId: string;
    geometry: unknown;
    properties: Record<string, unknown>;
  }>;
};

router.post("/presence", async (req, res) => {
  const meshIds = req.body?.meshIds;

  if (!Array.isArray(meshIds) || meshIds.some((id) => typeof id !== "string")) {
    return res.status(400).json({ error: "meshIds must be an array of strings" });
  }

  if (meshIds.length === 0) {
    return res.json({ meshes: [] });
  }

  const uniqueMeshIds = Array.from(new Set(meshIds));

  try {
    const rows = await db
      .select({
        meshId: meshIndex.meshId,
        hasPoints: meshIndex.hasPoints,
        hasLines: meshIndex.hasLines,
        hasPolygons: meshIndex.hasPolygons,
      })
      .from(meshIndex)
      .where(inArray(meshIndex.meshId, uniqueMeshIds));

    const rowMap = new Map(rows.map((row) => [row.meshId, row]));
    const meshes = uniqueMeshIds.map((meshId) => {
      const row = rowMap.get(meshId);
      const hasData = Boolean(
        row && (row.hasPoints || row.hasLines || row.hasPolygons)
      );
      return { meshId, hasData };
    });

    return res.json({ meshes });
  } catch (error) {
    console.error("Mesh presence lookup failed", error);
    return res.status(500).json({ error: "Failed to fetch mesh presence" });
  }
});

router.get("/layers", async (_req, res) => {
  try {
    const rows = await db.select().from(layerRegistry);
    const layers = rows
      .map((row) => ({
        layerName: row.layerName,
        geometryType: row.geometryType,
        sourceFile: row.sourceFile,
      }))
      .sort((a, b) => a.layerName.localeCompare(b.layerName));
    return res.json({ layers });
  } catch (error) {
    console.error("Layer registry lookup failed", error);
    return res.status(500).json({ error: "Failed to fetch layer registry" });
  }
});

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

    const layerRows = await db.select().from(layerRegistry);

    const meshMap = new Map(
      uniqueMeshIds.map((meshId) => [
        meshId,
        {
          meshId,
          presence: { points: false, lines: false, polygons: false },
          layerPresence: {} as Record<string, boolean>,
          layers: new Map<string, LayerEntry>(),
        },
      ])
    );

    meshRows.forEach((row) => {
      const entry = meshMap.get(row.meshId);
      if (!entry) {
        return;
      }
      entry.presence = {
        points: row.hasPoints,
        lines: row.hasLines,
        polygons: row.hasPolygons,
      };
      entry.layerPresence = row.layerPresence ?? {};
    });

    for (const layer of layerRows) {
      if (layer.geometryType === "point") {
        const result = await pool.query(
          `SELECT id, mesh_id, geometry, properties FROM "${layer.tableName}" WHERE mesh_id = ANY($1::text[])`,
          [uniqueMeshIds]
        );

        result.rows.forEach((row) => {
          const entry = meshMap.get(row.mesh_id);
          if (!entry) {
            return;
          }
          const layerEntry =
            entry.layers.get(layer.layerName) ??
            ({
              id: layer.layerName,
              type: "point",
              features: [],
            } as LayerEntry);
          layerEntry.features.push({
            id: row.id,
            meshId: row.mesh_id,
            geometry: row.geometry,
            properties: row.properties ?? {},
          });
          entry.layers.set(layer.layerName, layerEntry);
        });
      } else if (layer.geometryType === "line" && layer.meshMapTable) {
        const result = await pool.query(
          `SELECT id, mesh_id, geometry, properties, length_m, length_ratio FROM "${layer.meshMapTable}" WHERE mesh_id = ANY($1::text[])`,
          [uniqueMeshIds]
        );

        result.rows.forEach((row) => {
          const entry = meshMap.get(row.mesh_id);
          if (!entry) {
            return;
          }
          const layerEntry =
            entry.layers.get(layer.layerName) ??
            ({
              id: layer.layerName,
              type: "line",
              features: [],
            } as LayerEntry);
          layerEntry.features.push({
            id: row.id,
            meshId: row.mesh_id,
            geometry: row.geometry,
            properties: {
              ...(row.properties ?? {}),
              length_m: row.length_m,
              length_ratio: row.length_ratio,
            },
          });
          entry.layers.set(layer.layerName, layerEntry);
        });
      } else if (layer.geometryType === "polygon" && layer.meshMapTable) {
        const result = await pool.query(
          `SELECT id, mesh_id, geometry, properties, area_m2, area_ratio FROM "${layer.meshMapTable}" WHERE mesh_id = ANY($1::text[])`,
          [uniqueMeshIds]
        );

        result.rows.forEach((row) => {
          const entry = meshMap.get(row.mesh_id);
          if (!entry) {
            return;
          }
          const layerEntry =
            entry.layers.get(layer.layerName) ??
            ({
              id: layer.layerName,
              type: "polygon",
              features: [],
            } as LayerEntry);
          layerEntry.features.push({
            id: row.id,
            meshId: row.mesh_id,
            geometry: row.geometry,
            properties: {
              ...(row.properties ?? {}),
              area_m2: row.area_m2,
              area_ratio: row.area_ratio,
            },
          });
          entry.layers.set(layer.layerName, layerEntry);
        });
      }
    }

    const meshes = Array.from(meshMap.values()).map((entry) => ({
      meshId: entry.meshId,
      presence: entry.presence,
      layerPresence: entry.layerPresence,
      layers: Array.from(entry.layers.values()),
    }));

    return res.json({ meshes });
  } catch (error) {
    console.error("Mesh lookup failed", error);
    return res.status(500).json({ error: "Failed to fetch mesh data" });
  }
});

export default router;
