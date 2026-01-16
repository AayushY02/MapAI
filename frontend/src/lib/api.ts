import type { MeshLookupResponse } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";

export async function fetchMeshData(meshIds: string[]): Promise<MeshLookupResponse> {
  const response = await fetch(`${API_BASE}/api/mesh/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ meshIds }),
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return (await response.json()) as MeshLookupResponse;
}
