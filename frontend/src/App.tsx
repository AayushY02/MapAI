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
    detail: "全メッシュIDの主テーブル",
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
    detail: "全ポイントレイヤーを1テーブルに集約",
    columns: ["source_layer", "mesh_id", "geometry", "properties"],
  },
  {
    title: "line_features",
    detail: "全ラインレイヤーを1テーブルに集約",
    columns: ["source_layer", "mesh_id", "geometry", "properties"],
  },
  {
    title: "polygon_features",
    detail: "全ポリゴンレイヤーを1テーブルに集約",
    columns: ["source_layer", "mesh_id", "geometry", "properties"],
  },
  {
    title: "line_mesh_map",
    detail: "メッシュごとの切り出しライン（全レイヤー）",
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
    detail: "メッシュごとの切り出しポリゴン（全レイヤー）",
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
    detail: "ファイル別レイヤーテーブルのレジストリ",
    columns: ["layer_name", "table_name", "geometry_type", "mesh_map_table"],
  },
  {
    title: "動的レイヤーテーブル",
    detail: "GeoJSONファイルごとに1テーブル（ライン/ポリゴンは*_mesh_map付き）",
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
  const [activeMeshId, setActiveMeshId] = useState<string | null>(null);
  const [activeLayerId, setActiveLayerId] = useState<string>("all");
  const [featurePage, setFeaturePage] = useState(1);
  const FEATURES_PER_PAGE = 8;

  const orderedMeshIds = useMemo(
    () => [...selectedMeshIds].sort(),
    [selectedMeshIds]
  );

  useEffect(() => {
    if (selectedMeshIds.length === 0) {
      setMeshData(null);
      setFetchState({ loading: false, error: null });
      setActiveMeshId(null);
      setActiveLayerId("all");
      setFeaturePage(1);
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
      .catch(() => {
        if (active) {
          setMeshData(null);
          setFetchState({ loading: false, error: "データ取得に失敗しました。" });
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

  useEffect(() => {
    if (!meshData || meshData.meshes.length === 0) {
      setActiveMeshId(null);
      setActiveLayerId("all");
      setFeaturePage(1);
      return;
    }
    if (!activeMeshId || !meshData.meshes.some((mesh) => mesh.meshId === activeMeshId)) {
      setActiveMeshId(meshData.meshes[0].meshId);
      setActiveLayerId("all");
      setFeaturePage(1);
    }
  }, [meshData, activeMeshId]);

  useEffect(() => {
    setActiveLayerId("all");
    setFeaturePage(1);
  }, [activeMeshId]);

  const handleClearSelection = () => {
    setSelectedMeshIds([]);
    setMeshData(null);
    setActiveMeshId(null);
    setActiveLayerId("all");
    setFeaturePage(1);
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
        throw new Error("GeoJSONのFeatureまたはFeatureCollectionではありません。");
      }

      setUploadedGeojson(collection);
      setUploadedName(file.name);
      setUploadError(null);
    } catch (error) {
      setUploadedGeojson(null);
      setUploadedName(null);
      setUploadError("GeoJSONの読み込みに失敗しました。");
    }
  };

  const handleClearUpload = () => {
    setUploadedGeojson(null);
    setUploadedName(null);
    setUploadError(null);
  };

  const meshItems = meshData?.meshes ?? [];
  const meshSummaries = useMemo(
    () =>
      meshItems.map((mesh) => {
        const totalFeatures = mesh.layers.reduce(
          (sum, layer) => sum + layer.features.length,
          0
        );
        const hasData = mesh.presence.points || mesh.presence.lines || mesh.presence.polygons;
        return {
          meshId: mesh.meshId,
          totalFeatures,
          hasData,
          layers: mesh.layers,
          layerPresence: mesh.layerPresence ?? {},
        };
      }),
    [meshItems]
  );

  const activeMesh = meshItems.find((mesh) => mesh.meshId === activeMeshId) ?? null;
  const activeLayerIds = useMemo(() => {
    if (!activeMesh) {
      return [];
    }
    return Array.from(
      new Set([
        ...Object.keys(activeMesh.layerPresence ?? {}),
        ...activeMesh.layers.map((layer) => layer.id),
      ])
    ).sort();
  }, [activeMesh]);

  const activeLayerMap = useMemo(() => {
    if (!activeMesh) {
      return new Map<string, MeshLayer>();
    }
    return new Map(activeMesh.layers.map((layer) => [layer.id, layer]));
  }, [activeMesh]);

  const activeFeatures = useMemo(() => {
    if (!activeMesh) {
      return [] as Array<MeshLayer["features"][number] & { layerId: string }>;
    }
    if (activeLayerId === "all") {
      return activeMesh.layers.flatMap((layer) =>
        layer.features.map((feature) => ({ ...feature, layerId: layer.id }))
      );
    }
    const layer = activeLayerMap.get(activeLayerId);
    return (layer?.features ?? []).map((feature) => ({
      ...feature,
      layerId: activeLayerId,
    }));
  }, [activeMesh, activeLayerId, activeLayerMap]);

  const totalFeatures = meshSummaries.reduce(
    (sum, mesh) => sum + mesh.totalFeatures,
    0
  );
  const meshesWithData = meshSummaries.filter((mesh) => mesh.hasData).length;
  const totalPages = Math.max(1, Math.ceil(activeFeatures.length / FEATURES_PER_PAGE));
  const currentPage = Math.min(featurePage, totalPages);
  const pageStart = (currentPage - 1) * FEATURES_PER_PAGE;
  const pageItems = activeFeatures.slice(pageStart, pageStart + FEATURES_PER_PAGE);

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 py-8">
        <header className="flex flex-col gap-6 border-b border-white/60 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.32em] text-moss">
              メッシュインテリジェンス
            </div>
            <h1 className="mt-3 font-display text-4xl text-ink lg:text-5xl">
              メッシュ探索モック
            </h1>
            <p className="mt-3 max-w-xl text-sm text-ink/70">
              MapLibreのグリッドで250mメッシュを選択すると、該当メッシュIDに
              紐づくバックエンドのレイヤーデータを取得します。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-white/60 bg-white/80 px-4 py-2 text-xs uppercase tracking-[0.22em] text-moss">
              選択 {selectedMeshIds.length}
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
              {highlightData ? "データ強調: オン" : "データ強調: オフ"}
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
              GeoJSONをアップロード
            </button>
            {uploadedGeojson && (
              <button
                className="rounded-full border border-ink/10 bg-ink px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-sand transition hover:-translate-y-0.5 hover:bg-ink/90"
                onClick={handleClearUpload}
                type="button"
              >
                アップロードをクリア
              </button>
            )}
            <button
              className="rounded-full border border-ink/10 bg-ink px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-sand transition hover:-translate-y-0.5 hover:bg-ink/90"
              onClick={handleClearSelection}
              type="button"
            >
              クリア
            </button>
          </div>
        </header>

        <div className="mt-8 grid flex-1 gap-6 lg:grid-cols-[360px_1fr]">
          <aside className="space-y-6">
            <section className="rounded-2xl border border-white/70 bg-white/75 p-5 shadow-glow backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-ink/50">
                選択中のメッシュID
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {orderedMeshIds.length === 0 ? (
                  <div className="text-sm text-ink/50">
                    グリッドセルをクリックして検索を開始。
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
                      アップロード: {uploadedName}
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
                バックエンドスキーマ
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
                  取得データ
                </div>
                {fetchState.loading && (
                  <div className="text-xs text-moss">メッシュデータを読み込み中...</div>
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
                    まだデータがありません。メッシュIDを選択して結果を表示します。
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-ink/10 bg-sand/80 p-4">
                        <div className="text-[11px] uppercase tracking-[0.2em] text-ink/50">
                          選択メッシュ数
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-ink">
                          {meshSummaries.length}
                        </div>
                      </div>
                      <div className="rounded-xl border border-ink/10 bg-sand/80 p-4">
                        <div className="text-[11px] uppercase tracking-[0.2em] text-ink/50">
                          データありメッシュ数
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-ink">
                          {meshesWithData}
                        </div>
                      </div>
                      <div className="rounded-xl border border-ink/10 bg-sand/80 p-4">
                        <div className="text-[11px] uppercase tracking-[0.2em] text-ink/50">
                          取得フィーチャ数
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-ink">
                          {totalFeatures}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                      <div className="rounded-2xl border border-ink/10 bg-white/80 p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/50">
                          メッシュ一覧
                        </div>
                        <div className="mt-3 max-h-[420px] space-y-2 overflow-auto pr-1">
                          {meshSummaries.map((mesh) => (
                            <button
                              key={mesh.meshId}
                              type="button"
                              onClick={() => setActiveMeshId(mesh.meshId)}
                              className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition ${
                                mesh.meshId === activeMeshId
                                  ? "border-ocean/40 bg-ocean/10 text-ocean"
                                  : "border-ink/10 bg-white/80 text-ink/70 hover:-translate-y-0.5"
                              }`}
                            >
                              <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em]">
                                <span>{mesh.meshId}</span>
                                <span className="text-ink/40">
                                  {mesh.totalFeatures} 件
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <span className="rounded-full bg-ink/5 px-2 py-1 text-[10px] text-ink/60">
                                  ポイント {mesh.layers.filter((layer) => layer.type === "point").reduce((sum, layer) => sum + layer.features.length, 0)}
                                </span>
                                <span className="rounded-full bg-ink/5 px-2 py-1 text-[10px] text-ink/60">
                                  ライン {mesh.layers.filter((layer) => layer.type === "line").reduce((sum, layer) => sum + layer.features.length, 0)}
                                </span>
                                <span className="rounded-full bg-ink/5 px-2 py-1 text-[10px] text-ink/60">
                                  ポリゴン {mesh.layers.filter((layer) => layer.type === "polygon").reduce((sum, layer) => sum + layer.features.length, 0)}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-ink/10 bg-white/80 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/50">
                              インスペクター
                            </div>
                            <div className="mt-2 text-lg font-semibold text-ink">
                              {activeMesh?.meshId ?? "メッシュを選択"}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <LayerBadge
                              label="ポイント"
                              count={activeMesh?.layers.filter((layer) => layer.type === "point").reduce((sum, layer) => sum + layer.features.length, 0) ?? 0}
                              active={Boolean(activeMesh?.presence.points)}
                            />
                            <LayerBadge
                              label="ライン"
                              count={activeMesh?.layers.filter((layer) => layer.type === "line").reduce((sum, layer) => sum + layer.features.length, 0) ?? 0}
                              active={Boolean(activeMesh?.presence.lines)}
                            />
                            <LayerBadge
                              label="ポリゴン"
                              count={activeMesh?.layers.filter((layer) => layer.type === "polygon").reduce((sum, layer) => sum + layer.features.length, 0) ?? 0}
                              active={Boolean(activeMesh?.presence.polygons)}
                            />
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveLayerId("all")}
                            className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                              activeLayerId === "all"
                                ? "bg-ocean/15 text-ocean"
                                : "bg-ink/5 text-ink/60 hover:-translate-y-0.5"
                            }`}
                          >
                            全レイヤー
                          </button>
                          {activeLayerIds.map((layerId) => {
                            const layer = activeLayerMap.get(layerId);
                            return (
                              <button
                                key={layerId}
                                type="button"
                                onClick={() => setActiveLayerId(layerId)}
                                className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                                  activeLayerId === layerId
                                    ? "bg-ocean/15 text-ocean"
                                    : "bg-ink/5 text-ink/60 hover:-translate-y-0.5"
                                }`}
                              >
                                {formatLayerLabel(layerId)}{" "}
                                <span className="ml-1 text-[10px] text-ink/40">
                                  {layer?.features.length ?? 0}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        <div className="mt-4 space-y-3">
                          {activeFeatures.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-ink/15 bg-white/70 p-4 text-[11px] text-ink/50">
                              このメッシュ/レイヤーにはデータがありません。
                            </div>
                          ) : (
                            pageItems.map((feature) => (
                              <div
                                key={`${feature.layerId}-${feature.id}`}
                                className="rounded-xl border border-ink/10 bg-white/90 p-4 text-[11px] text-ink/70"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] font-semibold text-ink">
                                  <span>{feature.meshId}</span>
                                  <span className="rounded-full bg-ink/5 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-ink/60">
                                    {formatLayerLabel(feature.layerId)}
                                  </span>
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

                        {activeFeatures.length > 0 && (
                          <div className="mt-4 flex items-center justify-between text-xs text-ink/60">
                            <span>
                              ページ {currentPage} / {totalPages}
                            </span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setFeaturePage((prev) => Math.max(1, prev - 1))
                                }
                                disabled={currentPage === 1}
                                className="rounded-full border border-ink/10 bg-white/80 px-3 py-1 text-[11px] text-ink/60 transition disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                前へ
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setFeaturePage((prev) => Math.min(totalPages, prev + 1))
                                }
                                disabled={currentPage === totalPages}
                                className="rounded-full border border-ink/10 bg-white/80 px-3 py-1 text-[11px] text-ink/60 transition disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                次へ
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
