import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import MapView from "./components/MapView";
import { fetchMeshData } from "./lib/api";
import type {
  MeshLayer,
  MeshLookupResponse,
} from "./lib/types";
import type { Feature, FeatureCollection, Geometry } from "geojson";

type FetchState = {
  loading: boolean;
  error: string | null;
};

const schemaTiles = [
  {
    title: "mesh_index",
    detail: "Primary table for every mesh_id",
    columns: [
      "mesh_id",
      "has_points",
      "has_lines",
      "has_polygons",
      "layer_presence",
    ],
  },
  {
    title: "point_features",
    detail: "All point layers in one table",
    columns: ["source_layer", "mesh_id", "geometry", "properties"],
  },
  {
    title: "line_features",
    detail: "All line layers in one table",
    columns: ["source_layer", "mesh_id", "geometry", "properties"],
  },
  {
    title: "polygon_features",
    detail: "All polygon layers in one table",
    columns: ["source_layer", "mesh_id", "geometry", "properties"],
  },
  {
    title: "line_mesh_map",
    detail: "Clipped lines per mesh (all layers)",
    columns: [
      "source_layer",
      "mesh_id",
      "line_id",
      "geometry",
      "length_m",
      "length_ratio",
    ],
  },
  {
    title: "polygon_mesh_map",
    detail: "Clipped polygons per mesh (all layers)",
    columns: [
      "source_layer",
      "mesh_id",
      "polygon_id",
      "geometry",
      "area_m2",
      "area_ratio",
    ],
  },
  {
    title: "layer_registry",
    detail: "Registry for per-file layer tables",
    columns: ["layer_name", "table_name", "geometry_type", "mesh_map_table"],
  },
  {
    title: "dynamic layer tables",
    detail: "One table per GeoJSON file (plus *_mesh_map for lines/polygons)",
    columns: ["mesh_id", "geometry", "properties"],
  },
];

function formatLayerLabel(id: string) {
  return id
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

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
  layer,
  label,
}: {
  layer: MeshLayer | undefined;
  label: string;
}) {
  const items = layer?.features ?? [];
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
  const [highlightData, setHighlightData] = useState(false);
  const [uploadedGeojson, setUploadedGeojson] =
    useState<FeatureCollection<Geometry> | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>({
    loading: false,
    error: null,
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const data = JSON.parse(text) as unknown;
      let collection: FeatureCollection<Geometry> | null = null;

      if (
        data &&
        typeof data === "object" &&
        (data as FeatureCollection<Geometry>).type === "FeatureCollection"
      ) {
        const features = (data as FeatureCollection<Geometry>).features ?? [];
        collection = { type: "FeatureCollection", features };
      } else if (
        data &&
        typeof data === "object" &&
        (data as Feature<Geometry>).type === "Feature"
      ) {
        collection = {
          type: "FeatureCollection",
          features: [data as Feature<Geometry>],
        };
      }

      if (!collection) {
        throw new Error("Not a valid GeoJSON Feature or FeatureCollection.");
      }

      setUploadedGeojson(collection);
      setUploadedName(file.name);
      setUploadError(null);
    } catch (error) {
      setUploadedGeojson(null);
      setUploadedName(null);
      setUploadError(
        error instanceof Error ? error.message : "Failed to read GeoJSON."
      );
    }
  };

  const handleClearUpload = () => {
    setUploadedGeojson(null);
    setUploadedName(null);
    setUploadError(null);
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
              className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] transition ${
                highlightData
                  ? "border-moss/40 bg-moss text-sand"
                  : "border-white/60 bg-white/80 text-moss hover:-translate-y-0.5"
              }`}
              onClick={() => setHighlightData((prev) => !prev)}
              type="button"
              aria-pressed={highlightData}
            >
              {highlightData ? "Highlight On" : "Highlight Off"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".geojson,application/geo+json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              className="rounded-full border border-white/60 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-moss transition hover:-translate-y-0.5"
              onClick={handleUploadClick}
              type="button"
            >
              Upload GeoJSON
            </button>
            {uploadedGeojson && (
              <button
                className="rounded-full border border-ink/10 bg-ink px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-sand transition hover:-translate-y-0.5 hover:bg-ink/90"
                onClick={handleClearUpload}
                type="button"
              >
                Clear Upload
              </button>
            )}
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
              {(uploadedName || uploadError) && (
                <div className="mt-4 rounded-lg border border-ink/10 bg-white/80 p-3 text-xs text-ink/70">
                  {uploadedName && (
                    <div className="text-[11px] uppercase tracking-[0.2em] text-moss">
                      Uploaded: {uploadedName}
                    </div>
                  )}
                  {uploadError && (
                    <div className="mt-1 text-[11px] text-clay">
                      {uploadError}
                    </div>
                  )}
                </div>
              )}
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
                highlightData={highlightData}
                uploadedGeojson={uploadedGeojson}
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
                  meshData.meshes.map((mesh) => {
                    const layerMap = new Map(
                      mesh.layers.map((layer) => [layer.id, layer])
                    );
                    const typeCounts = mesh.layers.reduce(
                      (acc, layer) => {
                        acc[layer.type] += layer.features.length;
                        return acc;
                      },
                      { point: 0, line: 0, polygon: 0 }
                    );
                    const layerIds = Array.from(
                      new Set([
                        ...Object.keys(mesh.layerPresence ?? {}),
                        ...mesh.layers.map((layer) => layer.id),
                      ])
                    ).sort();
                    return (
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
                              count={typeCounts.point}
                              active={mesh.presence.points}
                            />
                            <LayerBadge
                              label="Lines"
                              count={typeCounts.line}
                              active={mesh.presence.lines}
                            />
                            <LayerBadge
                              label="Polygons"
                              count={typeCounts.polygon}
                              active={mesh.presence.polygons}
                            />
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {layerIds.length === 0 ? (
                            <div className="text-xs text-ink/50">
                              No layers flagged for this mesh.
                            </div>
                          ) : (
                            layerIds.map((layerId) => {
                              const layer = layerMap.get(layerId);
                              return (
                                <LayerBadge
                                  key={layerId}
                                  label={formatLayerLabel(layerId)}
                                  count={layer?.features.length ?? 0}
                                  active={Boolean(mesh.layerPresence?.[layerId])}
                                />
                              );
                            })
                          )}
                        </div>
                        <div className="mt-4 grid gap-4 lg:grid-cols-3">
                          {layerIds.map((layerId) => (
                            <FeatureList
                              key={layerId}
                              label={formatLayerLabel(layerId)}
                              layer={layerMap.get(layerId)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
