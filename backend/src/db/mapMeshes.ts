import type { AnyPgTable } from "drizzle-orm/pg-core";
import type {
  Feature,
  Geometry,
  LineString,
  MultiLineString,
  MultiPolygon,
  Polygon,
} from "geojson";
import { db } from "./index.js";
import {
  meshIndex,
  lineFeatures,
  lineMeshMap,
  polygonFeatures,
  polygonMeshMap,
} from "./schema.js";
import { buildLineMeshPieces, buildPolygonMeshPieces } from "./meshUtils.js";

const INSERT_CHUNK_SIZE = 500;

async function insertInChunks<TTable extends AnyPgTable>(
  table: TTable,
  rows: TTable["$inferInsert"][]
) {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
    if (chunk.length > 0) {
      await db.insert(table).values(chunk);
    }
  }
}

type MeshIndexInsert = typeof meshIndex.$inferInsert;

async function upsertMeshFlag(
  meshIds: Set<string>,
  flag: keyof MeshIndexInsert
) {
  const values = Array.from(meshIds).map((meshId) => ({
    meshId,
    [flag]: true,
  })) as MeshIndexInsert[];

  for (let i = 0; i < values.length; i += INSERT_CHUNK_SIZE) {
    const chunk = values.slice(i, i + INSERT_CHUNK_SIZE);
    if (chunk.length === 0) {
      continue;
    }
    const set = { [flag]: true } as Partial<MeshIndexInsert>;
    await db
      .insert(meshIndex)
      .values(chunk)
      .onConflictDoUpdate({
        target: meshIndex.meshId,
        set,
      });
  }
}

type LineRow = {
  id: number;
  sourceLayer: string;
  geometry: Geometry;
  properties: Record<string, unknown> | null;
};

type PolygonRow = {
  id: number;
  sourceLayer: string;
  geometry: Geometry;
  properties: Record<string, unknown> | null;
};

function asLineFeature(
  geometry: Geometry
): Feature<LineString | MultiLineString> | null {
  if (geometry.type !== "LineString" && geometry.type !== "MultiLineString") {
    return null;
  }
  return {
    type: "Feature",
    properties: {},
    geometry,
  };
}

function asPolygonFeature(
  geometry: Geometry
): Feature<Polygon | MultiPolygon> | null {
  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
    return null;
  }
  return {
    type: "Feature",
    properties: {},
    geometry,
  };
}

async function mapLineLayer(lineRows: LineRow[]) {
  const meshIds = new Set<string>();
  const rows: typeof lineMeshMap.$inferInsert[] = [];

  for (const line of lineRows) {
    const feature = asLineFeature(line.geometry);
    if (!feature) {
      continue;
    }

    const pieces = buildLineMeshPieces(feature);
    for (const piece of pieces) {
      rows.push({
        sourceLayer: line.sourceLayer,
        lineId: line.id,
        meshId: piece.meshId,
        geometry: piece.geometry,
        properties: line.properties ?? {},
        lengthM: piece.lengthM,
        lengthRatio: piece.lengthRatio,
      });
      meshIds.add(piece.meshId);
    }
  }

  await insertInChunks(lineMeshMap, rows);
  return meshIds;
}

async function mapPolygonLayer(polygonRows: PolygonRow[]) {
  const meshIds = new Set<string>();
  const rows: typeof polygonMeshMap.$inferInsert[] = [];

  for (const polygon of polygonRows) {
    const feature = asPolygonFeature(polygon.geometry);
    if (!feature) {
      continue;
    }

    const pieces = buildPolygonMeshPieces(feature);
    for (const piece of pieces) {
      rows.push({
        sourceLayer: polygon.sourceLayer,
        polygonId: polygon.id,
        meshId: piece.meshId,
        geometry: piece.geometry,
        properties: polygon.properties ?? {},
        areaM2: piece.areaM2,
        areaRatio: piece.areaRatio,
      });
      meshIds.add(piece.meshId);
    }
  }

  await insertInChunks(polygonMeshMap, rows);
  return meshIds;
}

async function resetMeshFlags() {
  await db.update(meshIndex).set({ hasLines: false, hasPolygons: false });
}

export async function mapLinePolygonMeshes() {
  await db.delete(lineMeshMap);
  await db.delete(polygonMeshMap);
  await resetMeshFlags();

  const lineRows = (await db.select().from(lineFeatures)) as LineRow[];
  const polygonRows = (await db.select().from(polygonFeatures)) as PolygonRow[];

  const lineMeshIds = await mapLineLayer(lineRows);
  const polygonMeshIds = await mapPolygonLayer(polygonRows);

  await upsertMeshFlag(lineMeshIds, "hasLines");
  await upsertMeshFlag(polygonMeshIds, "hasPolygons");
}
