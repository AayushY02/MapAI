import { useEffect, useRef, useState } from "react";
import maplibregl, { type MapLayerMouseEvent } from "maplibre-gl";
import { squareGrid } from "@turf/turf";
import type { FeatureCollection, Polygon } from "geojson";

const GRID_BOUNDS: [number, number, number, number] = [
  -122.455,
  37.748,
  -122.425,
  37.77,
];
const CELL_SIZE_KM = 0.25;
const SOURCE_ID = "mesh-grid";

type MapViewProps = {
  selectedMeshIds: string[];
  onSelectionChange: (meshIds: string[]) => void;
};

function buildMeshGrid(): FeatureCollection<Polygon> {
  const grid = squareGrid(GRID_BOUNDS, CELL_SIZE_KM, {
    units: "kilometers",
  }) as FeatureCollection<Polygon>;

  const features = grid.features.map((feature, index) => {
    const meshId = `M-${String(index + 1).padStart(4, "0")}`;
    return {
      ...feature,
      id: index + 1,
      properties: {
        ...feature.properties,
        mesh_id: meshId,
      },
    };
  });

  return { ...grid, features };
}

export default function MapView({
  selectedMeshIds,
  onSelectionChange,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const featureIdByMeshId = useRef<Map<string, number>>(new Map());
  const selectedRef = useRef<Set<string>>(new Set());
  const hoveredIdRef = useRef<number | null>(null);
  const [hoveredMeshId, setHoveredMeshId] = useState<string | null>(null);

  useEffect(() => {
    selectedRef.current = new Set(selectedMeshIds);
  }, [selectedMeshIds]);

  useEffect(() => {
    if (!mapContainerRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [-122.44, 37.759],
      zoom: 13.2,
      minZoom: 10,
      maxZoom: 17,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      const grid = buildMeshGrid();
      grid.features.forEach((feature) => {
        const meshId = String(feature.properties?.mesh_id ?? "");
        if (feature.id != null) {
          featureIdByMeshId.current.set(meshId, Number(feature.id));
        }
      });

      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: grid,
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
            "rgba(42, 121, 182, 0.15)",
          ],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.65,
            ["boolean", ["feature-state", "hover"], false],
            0.55,
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

      map.on("click", "mesh-fill", (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature || feature.id == null) {
          return;
        }

        const meshId = String(feature.properties?.mesh_id ?? feature.id);
        const featureId = Number(feature.id);
        const next = new Set(selectedRef.current);

        if (next.has(meshId)) {
          next.delete(meshId);
          map.setFeatureState(
            { source: SOURCE_ID, id: featureId },
            { selected: false }
          );
        } else {
          next.add(meshId);
          map.setFeatureState(
            { source: SOURCE_ID, id: featureId },
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

        const featureId = Number(feature.id);
        if (hoveredIdRef.current !== null && hoveredIdRef.current !== featureId) {
          map.setFeatureState(
            { source: SOURCE_ID, id: hoveredIdRef.current },
            { hover: false }
          );
        }

        hoveredIdRef.current = featureId;
        map.setFeatureState(
          { source: SOURCE_ID, id: featureId },
          { hover: true }
        );
        setHoveredMeshId(String(feature.properties?.mesh_id ?? feature.id));
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
      map.remove();
    };
  }, [onSelectionChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource(SOURCE_ID)) {
      return;
    }

    const next = new Set(selectedMeshIds);
    const current = selectedRef.current;
    const allIds = new Set([...current, ...next]);

    allIds.forEach((meshId) => {
      const featureId = featureIdByMeshId.current.get(meshId);
      if (featureId == null) {
        return;
      }
      map.setFeatureState(
        { source: SOURCE_ID, id: featureId },
        { selected: next.has(meshId) }
      );
    });

    selectedRef.current = next;
  }, [selectedMeshIds]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-glow">
      <div ref={mapContainerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-white/80 px-3 py-1 text-xs uppercase tracking-[0.25em] text-moss shadow-glow">
        250m mesh
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 rounded-2xl bg-white/90 px-4 py-3 text-xs text-ink/70 shadow-glow">
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
      </div>
    </div>
  );
}
