import type { Geometry } from "geojson";

export type MeshPresence = {
  points: boolean;
  lines: boolean;
  polygons: boolean;
};

export type MeshLayerId = string;

export type MeshLayerType = "point" | "line" | "polygon";

export type MeshFeature = {
  id: number;
  meshId: string;
  properties: Record<string, unknown>;
  geometry: Geometry;
};

export type MeshLayer = {
  id: MeshLayerId;
  type: MeshLayerType;
  features: MeshFeature[];
};

export type MeshLookupItem = {
  meshId: string;
  presence: MeshPresence;
  layerPresence: Record<string, boolean>;
  layers: MeshLayer[];
};

export type MeshLookupResponse = {
  meshes: MeshLookupItem[];
};
