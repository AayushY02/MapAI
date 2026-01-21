import {
  pgTable,
  text,
  boolean,
  jsonb,
  serial,
  timestamp,
  doublePrecision,
  integer,
} from "drizzle-orm/pg-core";
import type { Geometry } from "geojson";

export const meshIndex = pgTable("mesh_index", {
  meshId: text("mesh_id").primaryKey(),
  hasPoints: boolean("has_points").notNull().default(false),
  hasLines: boolean("has_lines").notNull().default(false),
  hasPolygons: boolean("has_polygons").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const pointFeatures = pgTable("point_features", {
  id: serial("id").primaryKey(),
  meshId: text("mesh_id")
    .notNull()
    .references(() => meshIndex.meshId, { onDelete: "cascade" }),
  // GeoJSON for mock usage; swap to PostGIS geometry for spatial indexing.
  geometry: jsonb("geometry").$type<Geometry>().notNull(),
  properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const lineFeatures = pgTable("line_features", {
  id: serial("id").primaryKey(),
  meshId: text("mesh_id")
    .notNull()
    .references(() => meshIndex.meshId, { onDelete: "cascade" }),
  geometry: jsonb("geometry").$type<Geometry>().notNull(),
  properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const polygonFeatures = pgTable("polygon_features", {
  id: serial("id").primaryKey(),
  meshId: text("mesh_id")
    .notNull()
    .references(() => meshIndex.meshId, { onDelete: "cascade" }),
  geometry: jsonb("geometry").$type<Geometry>().notNull(),
  properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const lineMeshMap = pgTable("line_mesh_map", {
  id: serial("id").primaryKey(),
  lineId: integer("line_id")
    .notNull()
    .references(() => lineFeatures.id, { onDelete: "cascade" }),
  meshId: text("mesh_id")
    .notNull()
    .references(() => meshIndex.meshId, { onDelete: "cascade" }),
  geometry: jsonb("geometry").$type<Geometry>().notNull(),
  properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default({}),
  lengthM: doublePrecision("length_m").notNull(),
  lengthRatio: doublePrecision("length_ratio").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const polygonMeshMap = pgTable("polygon_mesh_map", {
  id: serial("id").primaryKey(),
  polygonId: integer("polygon_id")
    .notNull()
    .references(() => polygonFeatures.id, { onDelete: "cascade" }),
  meshId: text("mesh_id")
    .notNull()
    .references(() => meshIndex.meshId, { onDelete: "cascade" }),
  geometry: jsonb("geometry").$type<Geometry>().notNull(),
  properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default({}),
  areaM2: doublePrecision("area_m2").notNull(),
  areaRatio: doublePrecision("area_ratio").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
