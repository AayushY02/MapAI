import "dotenv/config";
import { db, pool } from "./index.js";
import {
  lineFeatures,
  meshIndex,
  pointFeatures,
  polygonFeatures,
} from "./schema.js";

async function seed() {
  await db
    .insert(meshIndex)
    .values([
      {
        meshId: "M-0001",
        hasPoints: true,
        hasLines: true,
        hasPolygons: true,
      },
      {
        meshId: "M-0002",
        hasPoints: true,
        hasLines: false,
        hasPolygons: true,
      },
      {
        meshId: "M-0003",
        hasPoints: false,
        hasLines: true,
        hasPolygons: false,
      },
    ])
    .onConflictDoNothing();

  await db.insert(pointFeatures).values([
    {
      meshId: "M-0001",
      geometry: { type: "Point", coordinates: [-122.45, 37.761] },
      properties: { name: "Cafe Orbit", category: "poi" },
    },
    {
      meshId: "M-0001",
      geometry: { type: "Point", coordinates: [-122.447, 37.758] },
      properties: { name: "Sensor Alpha", category: "iot" },
    },
    {
      meshId: "M-0002",
      geometry: { type: "Point", coordinates: [-122.438, 37.764] },
      properties: { name: "Transit Stop", category: "mobility" },
    },
  ]);

  await db.insert(lineFeatures).values([
    {
      meshId: "M-0001",
      geometry: {
        type: "LineString",
        coordinates: [
          [-122.451, 37.759],
          [-122.446, 37.763],
        ],
      },
      properties: { name: "Bike Corridor", status: "active" },
    },
    {
      meshId: "M-0003",
      geometry: {
        type: "LineString",
        coordinates: [
          [-122.455, 37.768],
          [-122.448, 37.772],
        ],
      },
      properties: { name: "Utility Line", status: "planned" },
    },
  ]);

  await db.insert(polygonFeatures).values([
    {
      meshId: "M-0001",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-122.452, 37.757],
            [-122.447, 37.757],
            [-122.447, 37.761],
            [-122.452, 37.761],
            [-122.452, 37.757],
          ],
        ],
      },
      properties: { name: "Zone A", coverage: "mixed-use" },
    },
    {
      meshId: "M-0002",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-122.441, 37.762],
            [-122.436, 37.762],
            [-122.436, 37.766],
            [-122.441, 37.766],
            [-122.441, 37.762],
          ],
        ],
      },
      properties: { name: "Zone B", coverage: "green" },
    },
  ]);
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
