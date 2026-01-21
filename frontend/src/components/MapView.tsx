import { useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import type { FeatureCollection, Polygon } from "geojson";
import { fetchMeshPresence } from "../lib/api";

const JAPAN_BOUNDS: [number, number, number, number] = [
  122.93,
  24.04,
  153.99,
  45.95,
];
const MESH_LAT_STEP = 7.5 / 3600;
const MESH_LON_STEP = 11.25 / 3600;
const GRID_MIN_ZOOM = 10.8;
const MAX_FEATURES = 8000;
const SOURCE_ID = "mesh-grid";
const MAP_STYLE =
  import.meta.env.MAP_STYLE ?? "https://demotiles.maplibre.org/style.json";
const EMPTY_COLLECTION: FeatureCollection<Polygon> = {
  type: "FeatureCollection",
  features: [],
};

type MapViewProps = {
  selectedMeshIds: string[];
  onSelectionChange: (meshIds: string[]) => void;
  highlightData: boolean;
};

function meshCode250(lat: number, lon: number): string {
  const p = Math.floor(lat * 1.5);
  const q = Math.floor(lon) - 100;
  const latMinutes = lat * 60;
  const lonMinutes = lon * 60;
  const r = Math.floor((latMinutes - p * 40) / 5);
  const s = Math.floor((lonMinutes - Math.floor(lon) * 60) / 7.5);
  const t = Math.floor(((latMinutes - p * 40 - r * 5) * 60) / 30);
  const u = Math.floor(
    ((lonMinutes - Math.floor(lon) * 60 - s * 7.5) * 60) / 45
  );

  const latSeconds = lat * 3600;
  const lonSeconds = lon * 3600;
  const latBaseSeconds = p * 2400 + r * 300 + t * 30;
  const lonBaseSeconds = (q + 100) * 3600 + s * 450 + u * 45;
  const latSecIn1km = Math.min(
    29.999999,
    Math.max(0, latSeconds - latBaseSeconds)
  );
  const lonSecIn1km = Math.min(
    44.999999,
    Math.max(0, lonSeconds - lonBaseSeconds)
  );
  const latHalf = Math.floor(latSecIn1km / 15);
  const lonHalf = Math.floor(lonSecIn1km / 22.5);
  const halfDigit = latHalf * 2 + lonHalf + 1;
  const latSecInHalf = latSecIn1km - latHalf * 15;
  const lonSecInHalf = lonSecIn1km - lonHalf * 22.5;
  const latQuarter = Math.floor(latSecInHalf / 7.5);
  const lonQuarter = Math.floor(lonSecInHalf / 11.25);
  const quarterDigit = latQuarter * 2 + lonQuarter + 1;

  return `${String(p).padStart(2, "0")}${String(q).padStart(2, "0")}${r}${s}${t}${u}${halfDigit}${quarterDigit}`;
}

function buildMeshGrid(
  bounds: maplibregl.LngLatBounds
): { collection: FeatureCollection<Polygon>; total: number } {
  const west = Math.max(bounds.getWest(), JAPAN_BOUNDS[0]);
  const south = Math.max(bounds.getSouth(), JAPAN_BOUNDS[1]);
  const east = Math.min(bounds.getEast(), JAPAN_BOUNDS[2]);
  const north = Math.min(bounds.getNorth(), JAPAN_BOUNDS[3]);

  if (west >= east || south >= north) {
    return { collection: EMPTY_COLLECTION, total: 0 };
  }

  const startLat = Math.floor(south / MESH_LAT_STEP) * MESH_LAT_STEP;
  const startLon = Math.floor(west / MESH_LON_STEP) * MESH_LON_STEP;
  const endLat = Math.ceil(north / MESH_LAT_STEP) * MESH_LAT_STEP;
  const endLon = Math.ceil(east / MESH_LON_STEP) * MESH_LON_STEP;
  const rows = Math.ceil((endLat - startLat) / MESH_LAT_STEP);
  const cols = Math.ceil((endLon - startLon) / MESH_LON_STEP);
  const total = rows * cols;

  if (total === 0) {
    return { collection: EMPTY_COLLECTION, total };
  }

  if (total > MAX_FEATURES) {
    return { collection: EMPTY_COLLECTION, total };
  }

  const features: FeatureCollection<Polygon>["features"] = [];
  for (let row = 0; row < rows; row += 1) {
    const lat0 = startLat + row * MESH_LAT_STEP;
    const lat1 = Math.min(lat0 + MESH_LAT_STEP, JAPAN_BOUNDS[3]);
    const centerLat = lat0 + MESH_LAT_STEP / 2;
    for (let col = 0; col < cols; col += 1) {
      const lon0 = startLon + col * MESH_LON_STEP;
      const lon1 = Math.min(lon0 + MESH_LON_STEP, JAPAN_BOUNDS[2]);
      const centerLon = lon0 + MESH_LON_STEP / 2;
      const meshId = meshCode250(centerLat, centerLon);
      features.push({
        type: "Feature",
        id: meshId,
        properties: {
          mesh_id: meshId,
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [lon0, lat0],
              [lon1, lat0],
              [lon1, lat1],
              [lon0, lat1],
              [lon0, lat0],
            ],
          ],
        },
      });
    }
  }

  return {
    collection: { type: "FeatureCollection", features },
    total,
  };
}

export default function MapView({
  selectedMeshIds,
  onSelectionChange,
  highlightData,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef(false);
  const selectedRef = useRef<Set<string>>(new Set());
  const hoveredIdRef = useRef<string | null>(null);
  const highlightedRef = useRef<Set<string>>(new Set());
  const highlightEnabledRef = useRef(false);
  const presenceRequestRef = useRef(0);
  const lastGridMeshIdsRef = useRef<string[]>([]);
  const presenceFetcherRef = useRef<(meshIds: string[]) => void>(() => {});
  const [hoveredMeshId, setHoveredMeshId] = useState<string | null>(null);
  const [gridStatus, setGridStatus] = useState<"ready" | "zoom" | "dense">(
    "zoom"
  );

  useEffect(() => {
    selectedRef.current = new Set(selectedMeshIds);
  }, [selectedMeshIds]);

  useEffect(() => {
    highlightEnabledRef.current = highlightData;
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) {
      return;
    }
    const source = map.getSource(SOURCE_ID);
    if (!source) {
      return;
    }

    if (!highlightData) {
      highlightedRef.current.forEach((meshId) => {
        map.setFeatureState({ source: SOURCE_ID, id: meshId }, { hasData: false });
      });
      highlightedRef.current = new Set();
      return;
    }

    presenceFetcherRef.current(lastGridMeshIdsRef.current);
  }, [highlightData]);

  useEffect(() => {
    if (!mapContainerRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: [137.5, 36.5],
      zoom: 4.9,
      minZoom: 4,
      maxZoom: 16,
      maxBounds: [
        [JAPAN_BOUNDS[0], JAPAN_BOUNDS[1]],
        [JAPAN_BOUNDS[2], JAPAN_BOUNDS[3]],
      ],
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      mapLoadedRef.current = true;
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: EMPTY_COLLECTION,
        promoteId: "mesh_id",
      });

      map.addLayer({
        id: "mesh-fill",
        type: "fill",
        source: SOURCE_ID,
        paint: {
          "fill-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#2a79b6",
            ["boolean", ["feature-state", "hover"], false],
            "#c76c4c",
            ["boolean", ["feature-state", "hasData"], false],
            "#4c9f70",
            "rgba(42, 121, 182, 0.15)",
          ],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.65,
            ["boolean", ["feature-state", "hover"], false],
            0.55,
            ["boolean", ["feature-state", "hasData"], false],
            0.45,
            0.35,
          ],
        },
      });

      map.addLayer({
        id: "mesh-outline",
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": "rgba(42, 121, 182, 0.35)",
          "line-width": 1,
        },
      });

      const requestPresence = async (meshIds: string[]) => {
        if (!highlightEnabledRef.current || meshIds.length === 0) {
          return;
        }
        const requestId = (presenceRequestRef.current += 1);
        try {
          const response = await fetchMeshPresence(meshIds);
          if (presenceRequestRef.current !== requestId) {
            return;
          }
          if (!highlightEnabledRef.current) {
            return;
          }
          const next = new Set(
            response.meshes.filter((mesh) => mesh.hasData).map((mesh) => mesh.meshId)
          );
          const mapInstance = mapRef.current;
          if (!mapInstance) {
            return;
          }
          highlightedRef.current.forEach((meshId) => {
            if (!next.has(meshId)) {
              mapInstance.setFeatureState(
                { source: SOURCE_ID, id: meshId },
                { hasData: false }
              );
            }
          });
          next.forEach((meshId) => {
            if (!highlightedRef.current.has(meshId)) {
              mapInstance.setFeatureState(
                { source: SOURCE_ID, id: meshId },
                { hasData: true }
              );
            }
          });
          highlightedRef.current = next;
        } catch (error) {
          console.error("Failed to fetch mesh presence", error);
        }
      };

      presenceFetcherRef.current = requestPresence;

      const updateGrid = () => {
        const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
        if (!source) {
          return;
        }
        const zoom = map.getZoom();
        if (zoom < GRID_MIN_ZOOM) {
          source.setData(EMPTY_COLLECTION);
          setGridStatus("zoom");
          hoveredIdRef.current = null;
          setHoveredMeshId(null);
          lastGridMeshIdsRef.current = [];
          if (highlightEnabledRef.current) {
            highlightedRef.current.forEach((meshId) => {
              map.setFeatureState(
                { source: SOURCE_ID, id: meshId },
                { hasData: false }
              );
            });
            highlightedRef.current = new Set();
          }
          return;
        }

        const { collection, total } = buildMeshGrid(map.getBounds());
        if (total > MAX_FEATURES) {
          source.setData(EMPTY_COLLECTION);
          setGridStatus("dense");
          hoveredIdRef.current = null;
          setHoveredMeshId(null);
          lastGridMeshIdsRef.current = [];
          if (highlightEnabledRef.current) {
            highlightedRef.current.forEach((meshId) => {
              map.setFeatureState(
                { source: SOURCE_ID, id: meshId },
                { hasData: false }
              );
            });
            highlightedRef.current = new Set();
          }
          return;
        }

        source.setData(collection);
        setGridStatus("ready");
        selectedRef.current.forEach((meshId) => {
          map.setFeatureState(
            { source: SOURCE_ID, id: meshId },
            { selected: true }
          );
        });
        if (highlightEnabledRef.current) {
          highlightedRef.current.forEach((meshId) => {
            map.setFeatureState(
              { source: SOURCE_ID, id: meshId },
              { hasData: true }
            );
          });
        }

        const meshIds = collection.features
          .map((feature) => String(feature.properties?.mesh_id ?? feature.id))
          .filter(Boolean);
        lastGridMeshIdsRef.current = meshIds;
        if (highlightEnabledRef.current) {
          requestPresence(meshIds);
        }
      };

      updateGrid();
      map.on("moveend", updateGrid);

      map.on("click", "mesh-fill", (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature || feature.id == null) {
          return;
        }

        const meshId = String(feature.properties?.mesh_id ?? feature.id);
        const next = new Set(selectedRef.current);

        if (next.has(meshId)) {
          next.delete(meshId);
          map.setFeatureState(
            { source: SOURCE_ID, id: meshId },
            { selected: false }
          );
        } else {
          next.add(meshId);
          map.setFeatureState(
            { source: SOURCE_ID, id: meshId },
            { selected: true }
          );
        }

        selectedRef.current = next;
        onSelectionChange(Array.from(next).sort());
      });

      map.on("mousemove", "mesh-fill", (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature || feature.id == null) {
          return;
        }

        const meshId = String(feature.properties?.mesh_id ?? feature.id);
        if (hoveredIdRef.current !== null && hoveredIdRef.current !== meshId) {
          map.setFeatureState(
            { source: SOURCE_ID, id: hoveredIdRef.current },
            { hover: false }
          );
        }

        hoveredIdRef.current = meshId;
        map.setFeatureState(
          { source: SOURCE_ID, id: meshId },
          { hover: true }
        );
        setHoveredMeshId(meshId);
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "mesh-fill", () => {
        if (hoveredIdRef.current !== null) {
          map.setFeatureState(
            { source: SOURCE_ID, id: hoveredIdRef.current },
            { hover: false }
          );
        }
        hoveredIdRef.current = null;
        setHoveredMeshId(null);
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      mapLoadedRef.current = false;
      mapRef.current = null;
      map.remove();
    };
  }, [onSelectionChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) {
      return;
    }
    const source = map.getSource(SOURCE_ID);
    if (!source) {
      return;
    }

    const next = new Set(selectedMeshIds);
    const current = selectedRef.current;
    const allIds = new Set([...current, ...next]);

    allIds.forEach((meshId) => {
      map.setFeatureState(
        { source: SOURCE_ID, id: meshId },
        { selected: next.has(meshId) }
      );
    });

    selectedRef.current = next;
  }, [selectedMeshIds]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-glow">
      <div ref={mapContainerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-white/80 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-moss shadow-glow">
        Japan 250m mesh - JIS X 0410
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-2xl bg-white/90 px-4 py-3 text-xs text-ink/70 shadow-glow">
        {gridStatus === "zoom" && (
          <div className="text-sm font-semibold text-ink">
            Zoom in to see 250m mesh cells.
          </div>
        )}
        {gridStatus === "dense" && (
          <div className="text-sm font-semibold text-ink">
            Zoom in further to load the mesh grid.
          </div>
        )}
        {gridStatus === "ready" && (
          <>
            {hoveredMeshId ? (
              <div className="text-sm font-semibold text-ink">
                Hovering {hoveredMeshId}
              </div>
            ) : (
              <div>Hover a cell to inspect its mesh id.</div>
            )}
            <div className="mt-1 text-[11px] text-ink/60">
              Click cells to select and query backend data.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
