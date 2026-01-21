import "dotenv/config";
import path from "path";
import { promises as fs } from "fs";
import { eq } from "drizzle-orm";
import type {
  Feature,
  FeatureCollection,
  Geometry,
  LineString,
  MultiLineString,
  MultiPolygon,
  Point,
  Polygon,
} from "geojson";
import { db, pool } from "./index.js";
import {
  layerRegistry,
  lineFeatures,
  lineMeshMap,
  meshIndex,
  pointFeatures,
  polygonFeatures,
  polygonMeshMap,
} from "./schema.js";
import { meshCode250 } from "../utils/jisMesh.js";
import { buildLineMeshPieces, buildPolygonMeshPieces } from "./meshUtils.js";

type GeometryKind = "point" | "line" | "polygon";

type LayerDefinition = {
  layerName: string;
  tableName: string;
  geometryType: GeometryKind;
  sourceFile: string;
  meshMapTable: string | null;
  features: Feature<Geometry>[];
};

type LineItem = {
  meshId: string;
  geometry: LineString | MultiLineString;
  properties: Record<string, unknown>;
  pieces: ReturnType<typeof buildLineMeshPieces>;
};

type PolygonItem = {
  meshId: string;
  geometry: Polygon | MultiPolygon;
  properties: Record<string, unknown>;
  pieces: ReturnType<typeof buildPolygonMeshPieces>;
};

const INSERT_CHUNK_SIZE = 500;
const DATA_DIR = path.resolve(process.cwd(), "data");
const JAPAN_BOUNDS: [number, number, number, number] = [
  122.93,
  24.04,
  153.99,
  45.95,
];

function isPointInJapan([lon, lat]: [number, number]) {
  return (
    lon >= JAPAN_BOUNDS[0] &&
    lon <= JAPAN_BOUNDS[2] &&
    lat >= JAPAN_BOUNDS[1] &&
    lat <= JAPAN_BOUNDS[3]
  );
}

function normalizeLayerName(rawName: string): string {
  const base = rawName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!base) {
    return "layer";
  }
  return /^[a-z]/.test(base) ? base : `layer_${base}`;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function chunkArray<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

function toFeatureCollection(input: unknown): FeatureCollection<Geometry> {
  if (
    input &&
    typeof input === "object" &&
    (input as FeatureCollection).type === "FeatureCollection"
  ) {
    return input as FeatureCollection<Geometry>;
  }
  if (
    input &&
    typeof input === "object" &&
    (input as Feature).type === "Feature"
  ) {
    return {
      type: "FeatureCollection",
      features: [input as Feature<Geometry>],
    };
  }
  throw new Error("Unsupported GeoJSON payload");
}

function normalizeProperties(
  properties: Feature["properties"]
): Record<string, unknown> {
  if (!properties || typeof properties !== "object") {
    return {};
  }
  return properties as Record<string, unknown>;
}

function explodePointFeatures(
  features: Feature<Geometry>[]
): Feature<Point>[] {
  const results: Feature<Point>[] = [];
  features.forEach((feature) => {
    if (!feature.geometry) {
      return;
    }
    const properties = normalizeProperties(feature.properties);
    if (feature.geometry.type === "Point") {
      results.push({
        type: "Feature",
        geometry: feature.geometry,
        properties,
      });
    } else if (feature.geometry.type === "MultiPoint") {
      feature.geometry.coordinates.forEach((coords) => {
        results.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: coords },
          properties,
        });
      });
    }
  });
  return results;
}

function toLineItems(features: Feature<Geometry>[]): LineItem[] {
  const results: LineItem[] = [];
  features.forEach((feature) => {
    if (!feature.geometry) {
      return;
    }
    if (
      feature.geometry.type !== "LineString" &&
      feature.geometry.type !== "MultiLineString"
    ) {
      return;
    }
    const geometry = feature.geometry as LineString | MultiLineString;
    const properties = normalizeProperties(feature.properties);
    const pieces = buildLineMeshPieces({
      type: "Feature",
      geometry,
      properties: {},
    });
    if (pieces.length === 0) {
      return;
    }
    results.push({
      meshId: pieces[0].meshId,
      geometry,
      properties,
      pieces,
    });
  });
  return results;
}

function toPolygonItems(features: Feature<Geometry>[]): PolygonItem[] {
  const results: PolygonItem[] = [];
  features.forEach((feature) => {
    if (!feature.geometry) {
      return;
    }
    if (
      feature.geometry.type !== "Polygon" &&
      feature.geometry.type !== "MultiPolygon"
    ) {
      return;
    }
    const geometry = feature.geometry as Polygon | MultiPolygon;
    const properties = normalizeProperties(feature.properties);
    const pieces = buildPolygonMeshPieces({
      type: "Feature",
      geometry,
      properties: {},
    });
    if (pieces.length === 0) {
      return;
    }
    results.push({
      meshId: pieces[0].meshId,
      geometry,
      properties,
      pieces,
    });
  });
  return results;
}

async function tableExists(tableName: string): Promise<boolean> {
  const result = await pool.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1",
    [tableName]
  );
  return result.rowCount > 0;
}

async function ensureLayerTables(def: LayerDefinition) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${quoteIdent(def.tableName)} (
      "id" serial PRIMARY KEY NOT NULL,
      "mesh_id" text NOT NULL,
      "geometry" jsonb NOT NULL,
      "properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
      "created_at" timestamp with time zone DEFAULT now()
    )`
  );

  if (def.geometryType === "line" && def.meshMapTable) {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${quoteIdent(def.meshMapTable)} (
        "id" serial PRIMARY KEY NOT NULL,
        "mesh_id" text NOT NULL,
        "geometry" jsonb NOT NULL,
        "properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "length_m" double precision NOT NULL,
        "length_ratio" double precision NOT NULL,
        "created_at" timestamp with time zone DEFAULT now()
      )`
    );
  }

  if (def.geometryType === "polygon" && def.meshMapTable) {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${quoteIdent(def.meshMapTable)} (
        "id" serial PRIMARY KEY NOT NULL,
        "mesh_id" text NOT NULL,
        "geometry" jsonb NOT NULL,
        "properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
        "area_m2" double precision NOT NULL,
        "area_ratio" double precision NOT NULL,
        "created_at" timestamp with time zone DEFAULT now()
      )`
    );
  }
}

async function insertRowsDynamic(
  tableName: string,
  columns: string[],
  rows: Array<Array<string | number>>
) {
  const quotedColumns = columns.map(quoteIdent).join(", ");
  for (const chunk of chunkArray(rows, INSERT_CHUNK_SIZE)) {
    if (chunk.length === 0) {
      continue;
    }
    const values: Array<string | number> = [];
    const placeholders = chunk
      .map((row) => {
        const rowPlaceholders = row.map((value) => {
          values.push(value);
          return `$${values.length}`;
        });
        return `(${rowPlaceholders.join(", ")})`;
      })
      .join(", ");

    const text = `INSERT INTO ${quoteIdent(tableName)} (${quotedColumns}) VALUES ${placeholders}`;
    await pool.query(text, values);
  }
}

async function upsertMeshIndex(meshIds: string[]) {
  if (meshIds.length === 0) {
    return;
  }
  const rows = meshIds.map((meshId) => ({ meshId }));
  for (const chunk of chunkArray(rows, INSERT_CHUNK_SIZE)) {
    await db.insert(meshIndex).values(chunk).onConflictDoNothing();
  }
}

async function refreshMeshFlags(meshIds: string[]) {
  if (meshIds.length === 0) {
    return;
  }
  await pool.query(
    `UPDATE mesh_index
     SET has_points = EXISTS (SELECT 1 FROM point_features pf WHERE pf.mesh_id = mesh_index.mesh_id),
         has_lines = EXISTS (SELECT 1 FROM line_mesh_map lm WHERE lm.mesh_id = mesh_index.mesh_id),
         has_polygons = EXISTS (SELECT 1 FROM polygon_mesh_map pm WHERE pm.mesh_id = mesh_index.mesh_id)
     WHERE mesh_id = ANY($1::text[])`,
    [meshIds]
  );
}

async function removeLayerPresence(layerName: string, meshIds: string[]) {
  if (meshIds.length === 0) {
    return;
  }
  await pool.query(
    "UPDATE mesh_index SET layer_presence = layer_presence - $1::text WHERE mesh_id = ANY($2::text[])",
    [layerName, meshIds]
  );
}

async function addLayerPresence(layerName: string, meshIds: string[]) {
  if (meshIds.length === 0) {
    return;
  }
  await pool.query(
    "UPDATE mesh_index SET layer_presence = layer_presence || jsonb_build_object($1::text, true) WHERE mesh_id = ANY($2::text[])",
    [layerName, meshIds]
  );
}

async function getLayerMeshIds(
  tableName: string,
  meshMapTable: string | null
): Promise<string[]> {
  if (meshMapTable && (await tableExists(meshMapTable))) {
    const result = await pool.query(
      `SELECT DISTINCT mesh_id FROM ${quoteIdent(meshMapTable)}`
    );
    return result.rows.map((row) => row.mesh_id as string);
  }

  if (await tableExists(tableName)) {
    const result = await pool.query(
      `SELECT DISTINCT mesh_id FROM ${quoteIdent(tableName)}`
    );
    return result.rows.map((row) => row.mesh_id as string);
  }

  return [];
}

async function deleteGenericRows(layerName: string) {
  await db.delete(pointFeatures).where(eq(pointFeatures.sourceLayer, layerName));
  await db.delete(lineFeatures).where(eq(lineFeatures.sourceLayer, layerName));
  await db
    .delete(polygonFeatures)
    .where(eq(polygonFeatures.sourceLayer, layerName));
  await db.delete(lineMeshMap).where(eq(lineMeshMap.sourceLayer, layerName));
  await db
    .delete(polygonMeshMap)
    .where(eq(polygonMeshMap.sourceLayer, layerName));
}

async function deleteLayerTables(def: LayerDefinition) {
  if (await tableExists(def.tableName)) {
    await pool.query(`DELETE FROM ${quoteIdent(def.tableName)}`);
  }
  if (def.meshMapTable && (await tableExists(def.meshMapTable))) {
    await pool.query(`DELETE FROM ${quoteIdent(def.meshMapTable)}`);
  }
}

async function dropTable(tableName: string) {
  if (await tableExists(tableName)) {
    await pool.query(`DROP TABLE IF EXISTS ${quoteIdent(tableName)}`);
  }
}

async function removeLayer(layerRow: {
  layerName: string;
  tableName: string;
  meshMapTable: string | null;
}) {
  const oldMeshIds = await getLayerMeshIds(layerRow.tableName, layerRow.meshMapTable);
  await deleteGenericRows(layerRow.layerName);
  if (layerRow.meshMapTable) {
    await dropTable(layerRow.meshMapTable);
  }
  await dropTable(layerRow.tableName);
  await db
    .delete(layerRegistry)
    .where(eq(layerRegistry.layerName, layerRow.layerName));
  await removeLayerPresence(layerRow.layerName, oldMeshIds);
  await refreshMeshFlags(oldMeshIds);
}

async function processPointLayer(def: LayerDefinition): Promise<string[]> {
  const pointFeaturesList = explodePointFeatures(def.features);
  const layerRows: Array<Array<string>> = [];
  const genericRows: Array<typeof pointFeatures.$inferInsert> = [];
  const meshIds = new Set<string>();

  pointFeaturesList.forEach((feature) => {
    const [lon, lat] = feature.geometry.coordinates;
    if (!isPointInJapan([lon, lat])) {
      return;
    }
    const meshId = meshCode250(lat, lon);
    const properties = normalizeProperties(feature.properties);
    meshIds.add(meshId);
    layerRows.push([
      meshId,
      JSON.stringify(feature.geometry),
      JSON.stringify(properties),
    ]);
    genericRows.push({
      sourceLayer: def.layerName,
      meshId,
      geometry: feature.geometry,
      properties,
    });
  });

  await upsertMeshIndex(Array.from(meshIds));
  await insertRowsDynamic(def.tableName, ["mesh_id", "geometry", "properties"], layerRows);

  for (const chunk of chunkArray(genericRows, INSERT_CHUNK_SIZE)) {
    if (chunk.length > 0) {
      await db.insert(pointFeatures).values(chunk);
    }
  }

  return Array.from(meshIds);
}

async function processLineLayer(def: LayerDefinition): Promise<string[]> {
  if (!def.meshMapTable) {
    return [];
  }
  const items = toLineItems(def.features);
  const layerRows: Array<Array<string>> = [];
  const meshIds = new Set<string>();
  const primaryMeshIds = new Set<string>();

  items.forEach((item) => {
    primaryMeshIds.add(item.meshId);
    layerRows.push([
      item.meshId,
      JSON.stringify(item.geometry),
      JSON.stringify(item.properties),
    ]);
    item.pieces.forEach((piece) => {
      meshIds.add(piece.meshId);
    });
  });

  const meshIndexIds = Array.from(new Set([...primaryMeshIds, ...meshIds]));
  await upsertMeshIndex(meshIndexIds);
  await insertRowsDynamic(def.tableName, ["mesh_id", "geometry", "properties"], layerRows);

  for (const chunk of chunkArray(items, INSERT_CHUNK_SIZE)) {
    const chunkRows = chunk.map((item) => ({
      sourceLayer: def.layerName,
      meshId: item.meshId,
      geometry: item.geometry,
      properties: item.properties,
    }));
    const inserted = await db
      .insert(lineFeatures)
      .values(chunkRows)
      .returning({
        id: lineFeatures.id,
      });

    const genericMeshRows = inserted.flatMap((row, index) => {
      const item = chunk[index];
      return item.pieces.map((piece) => ({
        sourceLayer: def.layerName,
        lineId: row.id,
        meshId: piece.meshId,
        geometry: piece.geometry,
        properties: item.properties,
        lengthM: piece.lengthM,
        lengthRatio: piece.lengthRatio,
      }));
    });

    for (const meshChunk of chunkArray(genericMeshRows, INSERT_CHUNK_SIZE)) {
      if (meshChunk.length > 0) {
        await db.insert(lineMeshMap).values(meshChunk);
      }
    }

    const perLayerMeshRows: Array<Array<string | number>> = [];
    chunk.forEach((item) => {
      item.pieces.forEach((piece) => {
        perLayerMeshRows.push([
          piece.meshId,
          JSON.stringify(piece.geometry),
          JSON.stringify(item.properties),
          piece.lengthM,
          piece.lengthRatio,
        ]);
      });
    });

    await insertRowsDynamic(
      def.meshMapTable,
      ["mesh_id", "geometry", "properties", "length_m", "length_ratio"],
      perLayerMeshRows
    );
  }

  return Array.from(meshIds);
}

async function processPolygonLayer(def: LayerDefinition): Promise<string[]> {
  if (!def.meshMapTable) {
    return [];
  }
  const items = toPolygonItems(def.features);
  const layerRows: Array<Array<string>> = [];
  const meshIds = new Set<string>();
  const primaryMeshIds = new Set<string>();

  items.forEach((item) => {
    primaryMeshIds.add(item.meshId);
    layerRows.push([
      item.meshId,
      JSON.stringify(item.geometry),
      JSON.stringify(item.properties),
    ]);
    item.pieces.forEach((piece) => {
      meshIds.add(piece.meshId);
    });
  });

  const meshIndexIds = Array.from(new Set([...primaryMeshIds, ...meshIds]));
  await upsertMeshIndex(meshIndexIds);
  await insertRowsDynamic(def.tableName, ["mesh_id", "geometry", "properties"], layerRows);

  for (const chunk of chunkArray(items, INSERT_CHUNK_SIZE)) {
    const chunkRows = chunk.map((item) => ({
      sourceLayer: def.layerName,
      meshId: item.meshId,
      geometry: item.geometry,
      properties: item.properties,
    }));
    const inserted = await db
      .insert(polygonFeatures)
      .values(chunkRows)
      .returning({
        id: polygonFeatures.id,
      });

    const genericMeshRows = inserted.flatMap((row, index) => {
      const item = chunk[index];
      return item.pieces.map((piece) => ({
        sourceLayer: def.layerName,
        polygonId: row.id,
        meshId: piece.meshId,
        geometry: piece.geometry,
        properties: item.properties,
        areaM2: piece.areaM2,
        areaRatio: piece.areaRatio,
      }));
    });

    for (const meshChunk of chunkArray(genericMeshRows, INSERT_CHUNK_SIZE)) {
      if (meshChunk.length > 0) {
        await db.insert(polygonMeshMap).values(meshChunk);
      }
    }

    const perLayerMeshRows: Array<Array<string | number>> = [];
    chunk.forEach((item) => {
      item.pieces.forEach((piece) => {
        perLayerMeshRows.push([
          piece.meshId,
          JSON.stringify(piece.geometry),
          JSON.stringify(item.properties),
          piece.areaM2,
          piece.areaRatio,
        ]);
      });
    });

    await insertRowsDynamic(
      def.meshMapTable,
      ["mesh_id", "geometry", "properties", "area_m2", "area_ratio"],
      perLayerMeshRows
    );
  }

  return Array.from(meshIds);
}

async function processLayer(def: LayerDefinition) {
  const existingLayer = await db
    .select({
      layerName: layerRegistry.layerName,
      tableName: layerRegistry.tableName,
      geometryType: layerRegistry.geometryType,
      meshMapTable: layerRegistry.meshMapTable,
    })
    .from(layerRegistry)
    .where(eq(layerRegistry.layerName, def.layerName))
    .limit(1);

  const previous = existingLayer[0];
  const oldMeshIds = previous
    ? await getLayerMeshIds(previous.tableName, previous.meshMapTable)
    : [];

  await deleteGenericRows(def.layerName);
  await deleteLayerTables(def);

  if (previous?.meshMapTable && previous.geometryType !== def.geometryType) {
    await dropTable(previous.meshMapTable);
  }

  await ensureLayerTables(def);

  let newMeshIds: string[] = [];
  if (def.geometryType === "point") {
    newMeshIds = await processPointLayer(def);
  } else if (def.geometryType === "line") {
    newMeshIds = await processLineLayer(def);
  } else if (def.geometryType === "polygon") {
    newMeshIds = await processPolygonLayer(def);
  }

  await removeLayerPresence(def.layerName, oldMeshIds);
  await addLayerPresence(def.layerName, newMeshIds);
  await refreshMeshFlags(Array.from(new Set([...oldMeshIds, ...newMeshIds])));

  await db
    .insert(layerRegistry)
    .values({
      layerName: def.layerName,
      tableName: def.tableName,
      geometryType: def.geometryType,
      meshMapTable: def.meshMapTable,
      sourceFile: def.sourceFile,
    })
    .onConflictDoUpdate({
      target: layerRegistry.layerName,
      set: {
        tableName: def.tableName,
        geometryType: def.geometryType,
        meshMapTable: def.meshMapTable,
        sourceFile: def.sourceFile,
      },
    });
}

async function ingestFile(fileName: string) {
  const filePath = path.join(DATA_DIR, fileName);
  const raw = await fs.readFile(filePath, "utf-8");
  const data = JSON.parse(raw) as unknown;
  const collection = toFeatureCollection(data);
  const features = collection.features.filter((feature) => feature.geometry);

  const grouped: Record<GeometryKind, Feature<Geometry>[]> = {
    point: [],
    line: [],
    polygon: [],
  };

  features.forEach((feature) => {
    const geometry = feature.geometry;
    if (!geometry) {
      return;
    }
    if (geometry.type === "Point" || geometry.type === "MultiPoint") {
      grouped.point.push(feature);
      return;
    }
    if (geometry.type === "LineString" || geometry.type === "MultiLineString") {
      grouped.line.push(feature);
      return;
    }
    if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
      grouped.polygon.push(feature);
    }
  });

  const baseName = normalizeLayerName(path.basename(fileName, path.extname(fileName)));
  const geometryTypes = (Object.keys(grouped) as GeometryKind[]).filter(
    (key) => grouped[key].length > 0
  );

  if (geometryTypes.length === 0) {
    console.warn(`Skipping ${fileName}: no supported geometries.`);
    return;
  }

  const useSuffix = geometryTypes.length > 1;
  const layerDefs: LayerDefinition[] = geometryTypes.map((geometryType) => {
    const suffix =
      geometryType === "point"
        ? "points"
        : geometryType === "line"
          ? "lines"
          : "polygons";
    const layerName = useSuffix ? `${baseName}_${suffix}` : baseName;
    const tableName = layerName;
    return {
      layerName,
      tableName,
      geometryType,
      sourceFile: fileName,
      meshMapTable:
        geometryType === "point" ? null : `${tableName}_mesh_map`,
      features: grouped[geometryType],
    };
  });

  const existingLayers = await db
    .select({
      layerName: layerRegistry.layerName,
      tableName: layerRegistry.tableName,
      meshMapTable: layerRegistry.meshMapTable,
    })
    .from(layerRegistry)
    .where(eq(layerRegistry.sourceFile, fileName));

  const expectedLayerNames = new Set(layerDefs.map((def) => def.layerName));
  const staleLayers = existingLayers.filter(
    (layer) => !expectedLayerNames.has(layer.layerName)
  );

  for (const stale of staleLayers) {
    await removeLayer({
      layerName: stale.layerName,
      tableName: stale.tableName,
      meshMapTable: stale.meshMapTable ?? null,
    });
  }

  for (const def of layerDefs) {
    await processLayer(def);
    console.log(`Ingested ${def.layerName} (${def.geometryType})`);
  }
}

async function ingestAll() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    console.log("backend/data folder not found. Create it and add GeoJSON files.");
    return;
  }
  const files = await fs.readdir(DATA_DIR);
  const geojsonFiles = files.filter((file) =>
    file.toLowerCase().endsWith(".geojson")
  );

  if (geojsonFiles.length === 0) {
    console.log("No .geojson files found in backend/data.");
    return;
  }

  for (const fileName of geojsonFiles) {
    console.log(`Processing ${fileName}...`);
    await ingestFile(fileName);
  }
}

ingestAll()
  .then(() => {
    console.log("GeoJSON ingest complete.");
  })
  .catch((error) => {
    console.error("GeoJSON ingest failed:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    pool.end();
  });
