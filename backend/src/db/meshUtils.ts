import { area, bbox as turfBbox, bboxClip, length } from "@turf/turf";
import type {
  Feature,
  LineString,
  MultiLineString,
  MultiPolygon,
  Polygon,
} from "geojson";
import { meshCode250 } from "../utils/jisMesh.js";

export type BBox = [number, number, number, number];

type MeshCell = {
  meshId: string;
  bbox: BBox;
};

const JAPAN_BOUNDS: BBox = [122.93, 24.04, 153.99, 45.95];
const MESH_LAT_STEP_SEC = 7.5;
const MESH_LON_STEP_SEC = 11.25;
const MAX_CELLS_PER_FEATURE = (() => {
  const raw = Number(process.env.MAX_MESH_CELLS_PER_FEATURE ?? "0");
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return Number.POSITIVE_INFINITY;
})();

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

export function buildMeshCells(bbox: BBox): MeshCell[] {
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

export type LineMeshPiece = {
  meshId: string;
  geometry: LineString | MultiLineString;
  lengthM: number;
  lengthRatio: number;
};

export function buildLineMeshPieces(
  feature: Feature<LineString | MultiLineString>
): LineMeshPiece[] {
  const totalLengthKm = length(feature, { units: "kilometers" });
  if (!totalLengthKm || Number.isNaN(totalLengthKm)) {
    return [];
  }

  const cells = buildMeshCells(turfBbox(feature) as BBox);
  if (cells.length === 0) {
    return [];
  }

  const pieces: LineMeshPiece[] = [];
  for (const cell of cells) {
    const clipped = bboxClip(feature, cell.bbox);
    if (!clipped) {
      continue;
    }

    const clippedLengthKm = length(clipped, { units: "kilometers" });
    if (!clippedLengthKm || Number.isNaN(clippedLengthKm)) {
      continue;
    }

    pieces.push({
      meshId: cell.meshId,
      geometry: clipped.geometry as LineString | MultiLineString,
      lengthM: clippedLengthKm * 1000,
      lengthRatio: Math.min(1, clippedLengthKm / totalLengthKm),
    });
  }

  return pieces;
}

export type PolygonMeshPiece = {
  meshId: string;
  geometry: Polygon | MultiPolygon;
  areaM2: number;
  areaRatio: number;
};

export function buildPolygonMeshPieces(
  feature: Feature<Polygon | MultiPolygon>
): PolygonMeshPiece[] {
  const totalArea = area(feature);
  if (!totalArea || Number.isNaN(totalArea)) {
    return [];
  }

  const cells = buildMeshCells(turfBbox(feature) as BBox);
  if (cells.length === 0) {
    return [];
  }

  const pieces: PolygonMeshPiece[] = [];
  for (const cell of cells) {
    const clipped = bboxClip(feature, cell.bbox);
    if (!clipped) {
      continue;
    }

    const clippedArea = area(clipped);
    if (!clippedArea || Number.isNaN(clippedArea)) {
      continue;
    }

    pieces.push({
      meshId: cell.meshId,
      geometry: clipped.geometry as Polygon | MultiPolygon,
      areaM2: clippedArea,
      areaRatio: Math.min(1, clippedArea / totalArea),
    });
  }

  return pieces;
}
