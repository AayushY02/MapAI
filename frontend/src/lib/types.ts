import type { Geometry } from "geojson";

export type MeshPresence = {
  points: boolean;
  lines: boolean;
  polygons: boolean;
};

export type MeshFeature = {
  id: number;
  meshId: string;
  properties: Record<string, unknown>;
  geometry: Geometry;
};

export type MeshLookupItem = {
  meshId: string;
  presence: MeshPresence;
  points: MeshFeature[];
  lines: MeshFeature[];
  polygons: MeshFeature[];
};

export type MeshLookupResponse = {
  meshes: MeshLookupItem[];
};
