import { area, bbox as turfBbox, bboxClip, length } from "@turf/turf";
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
  lineFeatures,
  lineMeshMap,
  meshIndex,
  polygonFeatures,
  polygonMeshMap,
} from "./schema.js";
import { meshCode250 } from "../utils/jisMesh.js";

type BBox = [number, number, number, number];

const JAPAN_BOUNDS: BBox = [122.93, 24.04, 153.99, 45.95];
const MESH_LAT_STEP_SEC = 7.5;
const MESH_LON_STEP_SEC = 11.25;
const MAX_CELLS_PER_FEATURE = 12000;
const INSERT_CHUNK_SIZE = 500;

type MeshCell = {
  meshId: string;
  bbox: BBox;
};

function intersectBbox(bbox: BBox, bounds: BBox): BBox | null {
  const minLon = Math.max(bbox[0], bounds[0]);
  const minLat = Math.max(bbox[1], bounds[1]);
  const maxLon = Math.min(bbox[2], bounds[2]);
  const maxLat = Math.min(bbox[3], bounds[3]);

  if (minLon >= maxLon || minLat >= maxLat) {
    return null;
  }

  return [minLon, minLat, maxLon, maxLat];
}

function buildMeshCells(bbox: BBox): MeshCell[] {
  const bounded = intersectBbox(bbox, JAPAN_BOUNDS);
  if (!bounded) {
    return [];
  }

  const [minLon, minLat, maxLon, maxLat] = bounded;
  const minLatSec = minLat * 3600;
  const maxLatSec = maxLat * 3600;
  const minLonSec = minLon * 3600;
  const maxLonSec = maxLon * 3600;

  const startLatSec =
    Math.floor(minLatSec / MESH_LAT_STEP_SEC) * MESH_LAT_STEP_SEC;
  const endLatSec =
    Math.ceil(maxLatSec / MESH_LAT_STEP_SEC) * MESH_LAT_STEP_SEC;
  const startLonSec =
    Math.floor(minLonSec / MESH_LON_STEP_SEC) * MESH_LON_STEP_SEC;
  const endLonSec =
    Math.ceil(maxLonSec / MESH_LON_STEP_SEC) * MESH_LON_STEP_SEC;

  const rows = Math.ceil((endLatSec - startLatSec) / MESH_LAT_STEP_SEC);
  const cols = Math.ceil((endLonSec - startLonSec) / MESH_LON_STEP_SEC);
  const total = rows * cols;

  if (total > MAX_CELLS_PER_FEATURE) {
    console.warn("Skipping feature with excessive mesh cells", { total });
    return [];
  }

  const cells: MeshCell[] = [];
  for (let latSec = startLatSec; latSec < endLatSec; latSec += MESH_LAT_STEP_SEC) {
    const lat0 = latSec / 3600;
    const lat1 = (latSec + MESH_LAT_STEP_SEC) / 3600;
    const centerLat = (latSec + MESH_LAT_STEP_SEC / 2) / 3600;
    for (let lonSec = startLonSec; lonSec < endLonSec; lonSec += MESH_LON_STEP_SEC) {
      const lon0 = lonSec / 3600;
      const lon1 = (lonSec + MESH_LON_STEP_SEC) / 3600;
      const centerLon = (lonSec + MESH_LON_STEP_SEC / 2) / 3600;
      const meshId = meshCode250(centerLat, centerLon);
      cells.push({
        meshId,
        bbox: [lon0, lat0, lon1, lat1],
      });
    }
  }

  return cells;
}

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

async function upsertHasLines(meshIds: Set<string>) {
  const values = Array.from(meshIds).map((meshId) => ({
    meshId,
    hasLines: true,
  }));

  for (let i = 0; i < values.length; i += INSERT_CHUNK_SIZE) {
    const chunk = values.slice(i, i + INSERT_CHUNK_SIZE);
    if (chunk.length === 0) {
      continue;
    }
    await db
      .insert(meshIndex)
      .values(chunk)
      .onConflictDoUpdate({
        target: meshIndex.meshId,
        set: { hasLines: true },
      });
  }
}

async function upsertHasPolygons(meshIds: Set<string>) {
  const values = Array.from(meshIds).map((meshId) => ({
    meshId,
    hasPolygons: true,
  }));

  for (let i = 0; i < values.length; i += INSERT_CHUNK_SIZE) {
    const chunk = values.slice(i, i + INSERT_CHUNK_SIZE);
    if (chunk.length === 0) {
      continue;
    }
    await db
      .insert(meshIndex)
      .values(chunk)
      .onConflictDoUpdate({
        target: meshIndex.meshId,
        set: { hasPolygons: true },
      });
  }
}

function asFeature<TGeometry extends Geometry>(geometry: TGeometry): Feature<TGeometry> {
  return {
    type: "Feature",
    properties: {},
    geometry,
  };
}

export async function mapLinePolygonMeshes() {
  await db.delete(lineMeshMap);
  await db.delete(polygonMeshMap);

  const lineRows = await db.select().from(lineFeatures);
  const polygonRows = await db.select().from(polygonFeatures);

  const meshIdsWithLines = new Set<string>();
  const meshIdsWithPolygons = new Set<string>();

  for (const line of lineRows) {
    const geometry = line.geometry as Geometry;
    if (geometry.type !== "LineString" && geometry.type !== "MultiLineString") {
      continue;
    }
    const feature = asFeature(geometry as LineString | MultiLineString);
    const totalLengthKm = length(feature, { units: "kilometers" });
    if (!totalLengthKm || Number.isNaN(totalLengthKm)) {
      continue;
    }

    const cells = buildMeshCells(turfBbox(feature) as BBox);
    if (cells.length === 0) {
      continue;
    }

    const rows: (typeof lineMeshMap.$inferInsert)[] = [];
    for (const cell of cells) {
      const clipped = bboxClip(feature, cell.bbox);
      if (!clipped) {
        continue;
      }

      const clippedLengthKm = length(clipped, { units: "kilometers" });
      if (!clippedLengthKm || Number.isNaN(clippedLengthKm)) {
        continue;
      }

      rows.push({
        lineId: line.id,
        meshId: cell.meshId,
        geometry: clipped.geometry,
        properties: line.properties ?? {},
        lengthM: clippedLengthKm * 1000,
        lengthRatio: Math.min(1, clippedLengthKm / totalLengthKm),
      });
      meshIdsWithLines.add(cell.meshId);
    }

    await insertInChunks(lineMeshMap, rows);
  }

  for (const polygon of polygonRows) {
    const geometry = polygon.geometry as Geometry;
    if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
      continue;
    }
    const feature = asFeature(geometry as Polygon | MultiPolygon);
    const totalArea = area(feature);
    if (!totalArea || Number.isNaN(totalArea)) {
      continue;
    }

    const cells = buildMeshCells(turfBbox(feature) as BBox);
    if (cells.length === 0) {
      continue;
    }

    const rows: (typeof polygonMeshMap.$inferInsert)[] = [];
    for (const cell of cells) {
      const clipped = bboxClip(feature, cell.bbox);
      if (!clipped) {
        continue;
      }

      const clippedArea = area(clipped);
      if (!clippedArea || Number.isNaN(clippedArea)) {
        continue;
      }

      rows.push({
        polygonId: polygon.id,
        meshId: cell.meshId,
        geometry: clipped.geometry,
        properties: polygon.properties ?? {},
        areaM2: clippedArea,
        areaRatio: Math.min(1, clippedArea / totalArea),
      });
      meshIdsWithPolygons.add(cell.meshId);
    }

    await insertInChunks(polygonMeshMap, rows);
  }

  await upsertHasLines(meshIdsWithLines);
  await upsertHasPolygons(meshIdsWithPolygons);
}
