import { useEffect, useMemo, useState } from "react";
import MapView from "./components/MapView";
import { fetchMeshData } from "./lib/api";
import type { MeshLookupItem, MeshLookupResponse } from "./lib/types";

type FetchState = {
  loading: boolean;
  error: string | null;
};

const schemaTiles = [
  {
    title: "mesh_index",
    detail: "Primary table for every mesh_id",
    columns: ["mesh_id", "has_points", "has_lines", "has_polygons"],
  },
  {
    title: "point_features",
    detail: "GeoJSON point records per mesh",
    columns: ["mesh_id", "geometry", "properties"],
  },
  {
    title: "line_features",
    detail: "GeoJSON line records per mesh",
    columns: ["mesh_id", "geometry", "properties"],
  },
  {
    title: "polygon_features",
    detail: "GeoJSON polygon records per mesh",
    columns: ["mesh_id", "geometry", "properties"],
  },
];

function LayerBadge({
  label,
  count,
  active,
}: {
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <div
      className={`rounded-xl px-3 py-2 text-xs font-semibold ${
        active
          ? "bg-ocean/15 text-ocean"
          : "bg-black/5 text-ink/40"
      }`}
    >
      {label} <span className="ml-1 text-[11px]">({count})</span>
    </div>
  );
}

function FeatureList({
  items,
  label,
}: {
  items: MeshLookupItem["points"];
  label: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/50">
        {label} · {items.length}
      </div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink/15 bg-white/70 p-3 text-[11px] text-ink/50">
          No data returned.
        </div>
      ) : (
        items.map((feature) => (
          <div
            key={`${label}-${feature.id}`}
            className="rounded-lg border border-ink/10 bg-white/80 p-3 text-[11px] text-ink/70"
          >
            <div className="flex items-center justify-between text-[12px] font-semibold text-ink">
              <span>{feature.meshId}</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-moss">
                {feature.geometry.type}
              </span>
            </div>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-ink/70">
              {JSON.stringify(feature.properties, null, 2)}
            </pre>
          </div>
        ))
      )}
    </div>
  );
}

export default function App() {
  const [selectedMeshIds, setSelectedMeshIds] = useState<string[]>([]);
  const [meshData, setMeshData] = useState<MeshLookupResponse | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>({
    loading: false,
    error: null,
  });

  const orderedMeshIds = useMemo(
    () => [...selectedMeshIds].sort(),
    [selectedMeshIds]
  );

  useEffect(() => {
    if (selectedMeshIds.length === 0) {
      setMeshData(null);
      setFetchState({ loading: false, error: null });
      return;
    }

    let active = true;
    setFetchState({ loading: true, error: null });

    fetchMeshData(selectedMeshIds)
      .then((data) => {
        if (active) {
          setMeshData(data);
        }
      })
      .catch((error: Error) => {
        if (active) {
          setMeshData(null);
          setFetchState({ loading: false, error: error.message });
        }
      })
      .finally(() => {
        if (active) {
          setFetchState((prev) => ({ ...prev, loading: false }));
        }
      });

    return () => {
      active = false;
    };
  }, [selectedMeshIds]);

  const handleClearSelection = () => {
    setSelectedMeshIds([]);
    setMeshData(null);
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 py-8">
        <header className="flex flex-col gap-6 border-b border-white/60 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.32em] text-moss">
              Mesh Intelligence
            </div>
            <h1 className="mt-3 font-display text-4xl text-ink lg:text-5xl">
              Mesh Explorer Mockup
            </h1>
            <p className="mt-3 max-w-xl text-sm text-ink/70">
              Select 250m mesh blocks on the MapLibre grid to fetch the backend
              layer data tied to those mesh ids.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-white/60 bg-white/80 px-4 py-2 text-xs uppercase tracking-[0.22em] text-moss">
              Selected {selectedMeshIds.length}
            </div>
            <button
              className="rounded-full border border-ink/10 bg-ink px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-sand transition hover:-translate-y-0.5 hover:bg-ink/90"
              onClick={handleClearSelection}
              type="button"
            >
              Clear
            </button>
          </div>
        </header>

        <div className="mt-8 grid flex-1 gap-6 lg:grid-cols-[360px_1fr]">
          <aside className="space-y-6">
            <section className="rounded-2xl border border-white/70 bg-white/75 p-5 shadow-glow backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-ink/50">
                Selected Mesh IDs
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {orderedMeshIds.length === 0 ? (
                  <div className="text-sm text-ink/50">
                    Click grid cells to start a query.
                  </div>
                ) : (
                  orderedMeshIds.map((meshId) => (
                    <span
                      key={meshId}
                      className="rounded-full bg-ocean/10 px-3 py-1 text-xs font-semibold text-ocean"
                    >
                      {meshId}
                    </span>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-white/70 bg-white/75 p-5 shadow-glow backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-ink/50">
                Backend Schema
              </div>
              <div className="mt-4 space-y-4 text-xs text-ink/70">
                {schemaTiles.map((tile) => (
                  <div key={tile.title} className="rounded-xl bg-sand/80 p-4">
                    <div className="text-sm font-semibold text-ink">
                      {tile.title}
                    </div>
                    <div className="mt-1 text-[11px] text-ink/60">
                      {tile.detail}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {tile.columns.map((column) => (
                        <span
                          key={column}
                          className="rounded-full bg-white/80 px-2 py-1 text-[11px] text-ink/60"
                        >
                          {column}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          <main className="flex flex-col gap-6">
            <section className="h-[68vh] min-h-[480px]">
              <MapView
                selectedMeshIds={selectedMeshIds}
                onSelectionChange={setSelectedMeshIds}
              />
            </section>

            <section className="rounded-2xl border border-white/70 bg-white/75 p-5 shadow-glow backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-[0.3em] text-ink/50">
                  Data Returned
                </div>
                {fetchState.loading && (
                  <div className="text-xs text-moss">Loading mesh data...</div>
                )}
                {fetchState.error && (
                  <div className="text-xs text-clay">
                    {fetchState.error}
                  </div>
                )}
              </div>
              <div className="mt-4 space-y-4">
                {!meshData || meshData.meshes.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-ink/20 bg-white/80 p-4 text-sm text-ink/60">
                    No data yet. Select mesh ids to view backend results.
                  </div>
                ) : (
                  meshData.meshes.map((mesh) => (
                    <div
                      key={mesh.meshId}
                      className="rounded-2xl border border-ink/10 bg-sand/80 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold text-ink">
                            {mesh.meshId}
                          </div>
                          <div className="text-xs text-ink/60">
                            Layer presence from mesh_index
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <LayerBadge
                            label="Points"
                            count={mesh.points.length}
                            active={mesh.presence.points}
                          />
                          <LayerBadge
                            label="Lines"
                            count={mesh.lines.length}
                            active={mesh.presence.lines}
                          />
                          <LayerBadge
                            label="Polygons"
                            count={mesh.polygons.length}
                            active={mesh.presence.polygons}
                          />
                        </div>
                      </div>
                      <div className="mt-4 grid gap-4 lg:grid-cols-3">
                        <FeatureList label="Points" items={mesh.points} />
                        <FeatureList label="Lines" items={mesh.lines} />
                        <FeatureList label="Polygons" items={mesh.polygons} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
