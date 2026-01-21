import type { MeshLookupResponse } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";

export type MeshPresenceResponse = {
  meshes: Array<{
    meshId: string;
    hasData: boolean;
  }>;
};

export type LayerCatalogItem = {
  layerName: string;
  geometryType: "point" | "line" | "polygon";
  sourceFile: string;
};

export type LayerCatalogResponse = {
  layers: LayerCatalogItem[];
};

export async function fetchMeshData(meshIds: string[]): Promise<MeshLookupResponse> {
  const response = await fetch(`${API_BASE}/api/mesh/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ meshIds }),
  });

  if (!response.ok) {
    throw new Error(`リクエストに失敗しました (${response.status})`);
  }

  return (await response.json()) as MeshLookupResponse;
}

export async function fetchLayerCatalog(): Promise<LayerCatalogResponse> {
  const response = await fetch(`${API_BASE}/api/mesh/layers`);

  if (!response.ok) {
    throw new Error(`リクエストに失敗しました (${response.status})`);
  }

  return (await response.json()) as LayerCatalogResponse;
}

export async function fetchMeshPresence(
  meshIds: string[]
): Promise<MeshPresenceResponse> {
  const response = await fetch(`${API_BASE}/api/mesh/presence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ meshIds }),
  });

  if (!response.ok) {
    throw new Error(`リクエストに失敗しました (${response.status})`);
  }

  return (await response.json()) as MeshPresenceResponse;
}
