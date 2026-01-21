import "dotenv/config";
import { db, pool } from "./index.js";
import {
  lineFeatures,
  meshIndex,
  pointFeatures,
  polygonFeatures,
} from "./schema.js";
import { meshCode250 } from "../utils/jisMesh.js";
import type { LineString, Point, Polygon } from "geojson";
import { mapLinePolygonMeshes } from "./mapMeshes.js";

async function seed() {
  const pointSamples = [
    {
      coordinates: [139.767, 35.681] as [number, number],
      properties: { name: "Tokyo Station", category: "poi" },
    },
    {
      coordinates: [139.703, 35.69] as [number, number],
      properties: { name: "Shinjuku Sensor", category: "iot" },
    },
    {
      coordinates: [139.701, 35.659] as [number, number],
      properties: { name: "Shibuya Node", category: "mobility" },
    },
  ];

  const points = pointSamples.map((sample) => {
    const [lon, lat] = sample.coordinates;
    return {
      meshId: meshCode250(lat, lon),
      geometry: {
        type: "Point",
        coordinates: sample.coordinates,
      } as Point,
      properties: sample.properties,
    };
  });

  const lineSamples = [
    {
      coordinates: [
        [139.759, 35.678],
        [139.771, 35.688],
      ] as [number, number][],
      properties: { name: "Central Corridor", status: "active" },
      center: [139.765, 35.683] as [number, number],
    },
    {
      coordinates: [
        [139.696, 35.665],
        [139.707, 35.674],
      ] as [number, number][],
      properties: { name: "Yamanote Link", status: "planned" },
      center: [139.7015, 35.6695] as [number, number],
    },
  ];

  const lines = lineSamples.map((sample) => {
    const [lon, lat] = sample.center;
    return {
      meshId: meshCode250(lat, lon),
      geometry: {
        type: "LineString",
        coordinates: sample.coordinates,
      } as LineString,
      properties: sample.properties,
    };
  });

  const polygonSamples = [
    {
      coordinates: [
        [
          [139.762, 35.677],
          [139.768, 35.677],
          [139.768, 35.683],
          [139.762, 35.683],
          [139.762, 35.677],
        ],
      ] as [number, number][][],
      properties: { name: "Chiyoda Zone", coverage: "mixed-use" },
      center: [139.765, 35.68] as [number, number],
    },
    {
      coordinates: [
        [
          [139.698, 35.657],
          [139.704, 35.657],
          [139.704, 35.663],
          [139.698, 35.663],
          [139.698, 35.657],
        ],
      ] as [number, number][][],
      properties: { name: "Shibuya Green", coverage: "park" },
      center: [139.701, 35.66] as [number, number],
    },
  ];

  const polygons = polygonSamples.map((sample) => {
    const [lon, lat] = sample.center;
    return {
      meshId: meshCode250(lat, lon),
      geometry: {
        type: "Polygon",
        coordinates: sample.coordinates,
      } as Polygon,
      properties: sample.properties,
    };
  });

  const meshIds = Array.from(
    new Set([
      ...points.map((row) => row.meshId),
      ...lines.map((row) => row.meshId),
      ...polygons.map((row) => row.meshId),
    ])
  );

  const meshIndexRows = meshIds.map((meshId) => ({
    meshId,
    hasPoints: points.some((row) => row.meshId === meshId),
    hasLines: lines.some((row) => row.meshId === meshId),
    hasPolygons: polygons.some((row) => row.meshId === meshId),
  }));

  await db.insert(meshIndex).values(meshIndexRows).onConflictDoNothing();
  await db.insert(pointFeatures).values(points);
  await db.insert(lineFeatures).values(lines);
  await db.insert(polygonFeatures).values(polygons);

  await mapLinePolygonMeshes();
}

seed()
  .then(() => {
    console.log("Seed complete");
  })
  .catch((error) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(() => {
    pool.end();
  });
