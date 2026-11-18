import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";

import { RISK_COLORS, ROUTE_COLORS } from "../riskColors";
import type { AnalyzedRoute, Checkpoint, RouteAnalysis } from "../types/analysis";

// MapLibre resolves its worker relative to the bundled module URL, which 404s under Vite.
maplibregl.setWorkerUrl(workerUrl);

const DEFAULT_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const configuredStyleUrl = (import.meta.env.VITE_MAP_STYLE_URL as string | undefined)?.trim();
const STYLE_TIMEOUT_MS = 12_000;

const fallbackStyle: StyleSpecification = {
  version: 8,
  sources: {
    basemap: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    { id: "fallback-background", type: "background", paint: { "background-color": "#0b151b" } },
    {
      id: "fallback-basemap",
      type: "raster",
      source: "basemap",
      paint: {
        "raster-brightness-min": 0.04,
        "raster-brightness-max": 0.72,
        "raster-saturation": -0.5,
        "raster-contrast": 0.06,
      },
    },
  ],
};

type RouteAnalysisMapProps = {
  analysis: RouteAnalysis;
  selectedRouteId: string;
  forecastHour: number;
  showHeatmap: boolean;
  timezone: string;
};

function formatValue(value: number | null, digits: number): string {
  return value === null ? "—" : value.toFixed(digits);
}

function popupHtml(checkpoint: Checkpoint, timezone: string): string {
  const overall = checkpoint.risk.overall;
  const color = RISK_COLORS[overall] ?? RISK_COLORS.Unknown;
  const weather = checkpoint.weather;
  const eta = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(checkpoint.eta));
  return (
    `<div class="popup">` +
    `<div class="popup__title"><strong>MILE ${checkpoint.mile_marker.toFixed(0)}</strong>` +
    `<span class="popup__risk" style="--level-color:${color}">${overall}</span></div>` +
    `<div class="popup__row"><span>ETA</span><b>${eta}</b></div>` +
    `<div class="popup__row"><span>Wind</span><b>${formatValue(weather.wind_mph, 0)} mph · ${checkpoint.risk.wind}</b></div>` +
    `<div class="popup__row"><span>Rain</span><b>${formatValue(weather.rain_inches_per_hour, 2)} in/hr · ${checkpoint.risk.rain}</b></div>` +
    `<div class="popup__row"><span>Snow</span><b>${formatValue(weather.snow_inches_per_hour, 1)} in/hr · ${checkpoint.risk.snow}</b></div>` +
    (overall !== "Low" && checkpoint.risk.causes.length > 0
      ? `<div class="popup__foot">Driven by ${checkpoint.risk.causes.join(", ")}</div>`
      : "") +
    `</div>`
  );
}

function upsertGeoJson(
  map: MapLibreMap,
  id: string,
  data: FeatureCollection<LineString | Point>,
): void {
  const source = map.getSource(id) as GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
  } else {
    map.addSource(id, { type: "geojson", data });
  }
}

const METERS_PER_MILE = 1609.344;
const EARTH_RADIUS_METERS = 6_371_008.8;

function distanceMeters(start: [number, number], end: [number, number]): number {
  const lat1 = (start[1] * Math.PI) / 180;
  const lat2 = (end[1] * Math.PI) / 180;
  const deltaLat = lat2 - lat1;
  const deltaLon = ((end[0] - start[0]) * Math.PI) / 180;
  const h =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/** Resample a route polyline so the risk ribbon reads as a continuous band. */
function resampleRoute(
  coordinates: [number, number][],
  stepMiles: number,
): [number, number][] {
  const step = stepMiles * METERS_PER_MILE;
  const sampled: [number, number][] = [coordinates[0]];
  let sinceLast = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const segment = distanceMeters(start, end);
    if (segment === 0) {
      continue;
    }
    let position = 0;
    while (sinceLast + (segment - position) >= step) {
      position += step - sinceLast;
      sinceLast = 0;
      const fraction = position / segment;
      sampled.push([
        start[0] + (end[0] - start[0]) * fraction,
        start[1] + (end[1] - start[1]) * fraction,
      ]);
    }
    sinceLast += segment - position;
  }
  sampled.push(coordinates[coordinates.length - 1]);
  return sampled;
}

function corridorScore(
  point: [number, number],
  samples: [number, number, number[]][],
  hour: number,
): number {
  const cosLat = Math.cos((point[1] * Math.PI) / 180);
  let closest = Number.POSITIVE_INFINITY;
  let score = 5;
  for (const [longitude, latitude, risks] of samples) {
    const dx = (longitude - point[0]) * cosLat;
    const dy = latitude - point[1];
    const squared = dx * dx + dy * dy;
    if (squared < closest) {
      closest = squared;
      score = risks[hour] ?? 5;
    }
  }
  return score;
}

function RouteAnalysisMap({
  analysis,
  selectedRouteId,
  forecastHour,
  showHeatmap,
  timezone,
}: RouteAnalysisMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: configuredStyleUrl || DEFAULT_STYLE_URL,
      center: [-110.5, 40.4],
      zoom: 6,
      attributionControl: false,
    });

    let timedOut = false;
    const styleTimeout = window.setTimeout(() => {
      if (map.isStyleLoaded()) {
        return;
      }
      timedOut = true;
      map.setStyle(fallbackStyle);
      setMapError("Basemap style did not load — using the OpenStreetMap fallback.");
    }, STYLE_TIMEOUT_MS);

    const handleStyleLoad = () => {
      window.clearTimeout(styleTimeout);
      setMapReady(true);
      if (!timedOut) {
        setMapError(null);
      }
    };

    map.on("load", handleStyleLoad);
    map.on("style.load", handleStyleLoad);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    mapRef.current = map;

    const container = containerRef.current;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);

    return () => {
      window.clearTimeout(styleTimeout);
      observer.disconnect();
      map.off("load", handleStyleLoad);
      map.off("style.load", handleStyleLoad);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Route lines, checkpoint dots, popups.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }

    const handleCheckpointClick = (
      event: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] },
    ) => {
      const feature = event.features?.[0];
      if (!feature?.properties) {
        return;
      }
      const checkpoint: Checkpoint | undefined = feature.properties.checkpoint;
      if (!checkpoint) {
        return;
      }
      new maplibregl.Popup({ closeButton: true, offset: 12, maxWidth: "260px" })
        .setLngLat(event.lngLat)
        .setHTML(popupHtml(checkpoint, timezone))
        .addTo(map);
    };
    const showPointer = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const hidePointer = () => {
      map.getCanvas().style.cursor = "";
    };

    const render = () => {
      const routes: FeatureCollection<LineString> = {
        type: "FeatureCollection",
        features: analysis.routes.map((route: AnalyzedRoute, index: number) => ({
          type: "Feature",
          geometry: route.geometry,
          properties: {
            id: route.id,
            color: ROUTE_COLORS[index] ?? "#7f939d",
            selected: route.id === selectedRouteId ? 1 : 0,
          },
        })),
      };

      const selected = analysis.routes.find((route) => route.id === selectedRouteId) ?? analysis.routes[0];
      const checkpoints: FeatureCollection<Point> = {
        type: "FeatureCollection",
        features: selected.checkpoints.map((checkpoint) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [checkpoint.coordinate.longitude, checkpoint.coordinate.latitude],
          },
          properties: {
            color: RISK_COLORS[checkpoint.risk.overall] ?? RISK_COLORS.Unknown,
            checkpoint,
          },
        })),
      };

      upsertGeoJson(map, "routes", routes);
      upsertGeoJson(map, "checkpoints", checkpoints);

      if (!map.getLayer("route-casing")) {
        map.addLayer({
          id: "route-casing",
          type: "line",
          source: "routes",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#03110c",
            "line-width": ["case", ["==", ["get", "selected"], 1], 11, 7],
            "line-opacity": 0.65,
          },
        });
      }
      if (!map.getLayer("route-lines")) {
        map.addLayer({
          id: "route-lines",
          type: "line",
          source: "routes",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["case", ["==", ["get", "selected"], 1], 5.5, 3],
            "line-opacity": ["case", ["==", ["get", "selected"], 1], 1, 0.62],
          },
        });
      }
      if (!map.getLayer("checkpoint-dots")) {
        map.addLayer({
          id: "checkpoint-dots",
          type: "circle",
          source: "checkpoints",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 3.5, 8, 5.5],
            "circle-color": ["get", "color"],
            "circle-stroke-color": "#04121a",
            "circle-stroke-width": 1.6,
          },
        });
      }

      map.off("click", "checkpoint-dots", handleCheckpointClick);
      map.off("mouseenter", "checkpoint-dots", showPointer);
      map.off("mouseleave", "checkpoint-dots", hidePointer);
      map.on("click", "checkpoint-dots", handleCheckpointClick);
      map.on("mouseenter", "checkpoint-dots", showPointer);
      map.on("mouseleave", "checkpoint-dots", hidePointer);
    };

    map.on("load", render);
    map.on("style.load", render);
    render();

    return () => {
      map.off("load", render);
      map.off("style.load", render);
      map.off("click", "checkpoint-dots", handleCheckpointClick);
      map.off("mouseenter", "checkpoint-dots", showPointer);
      map.off("mouseleave", "checkpoint-dots", hidePointer);
    };
  }, [analysis, mapReady, selectedRouteId, timezone]);

  // Corridor risk ribbon + unknown cells.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }

    const render = () => {
      const corridor: FeatureCollection<Point> = {
        type: "FeatureCollection",
        features: analysis.routes
          .flatMap((route) =>
            resampleRoute(route.geometry.coordinates, 4).map((coordinate) => ({
              type: "Feature" as const,
              geometry: { type: "Point" as const, coordinates: coordinate },
              properties: { weight: corridorScore(coordinate, analysis.heatmap.points, forecastHour) },
            })),
          )
          .filter((feature) => feature.properties.weight < 5),
      };

      const unknownCells: FeatureCollection<Point> = {
        type: "FeatureCollection",
        features: analysis.heatmap.points
          .filter(([, , risks]) => (risks[forecastHour] ?? 5) >= 5)
          .map(([longitude, latitude]) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [longitude, latitude] as [number, number] },
            properties: {},
          })),
      };

      upsertGeoJson(map, "corridor", corridor);
      upsertGeoJson(map, "corridor-unknown", unknownCells);

      if (!map.getLayer("corridor-risk")) {
        map.addLayer(
          {
            id: "corridor-risk",
            type: "circle",
            source: "corridor",
            layout: { visibility: showHeatmap ? "visible" : "none" },
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 7, 6, 14, 9, 24],
              "circle-color": [
                "interpolate",
                ["linear"],
                ["get", "weight"],
                0,
                RISK_COLORS.Low,
                1,
                RISK_COLORS.Moderate,
                2,
                RISK_COLORS.High,
                3,
                RISK_COLORS.Severe,
                4,
                RISK_COLORS["No Travel"],
              ],
              "circle-blur": 1,
              "circle-opacity": 0.27,
            },
          },
          map.getLayer("route-casing") ? "route-casing" : undefined,
        );
      } else {
        map.setLayoutProperty("corridor-risk", "visibility", showHeatmap ? "visible" : "none");
      }

      if (!map.getLayer("corridor-unknown")) {
        map.addLayer(
          {
            id: "corridor-unknown",
            type: "circle",
            source: "corridor-unknown",
            layout: { visibility: showHeatmap ? "visible" : "none" },
            paint: {
              "circle-radius": 3.5,
              "circle-color": RISK_COLORS.Unknown,
              "circle-opacity": 0.8,
              "circle-stroke-color": "#04121a",
              "circle-stroke-width": 1,
            },
          },
          map.getLayer("route-casing") ? "route-casing" : undefined,
        );
      } else {
        map.setLayoutProperty("corridor-unknown", "visibility", showHeatmap ? "visible" : "none");
      }
    };

    map.on("load", render);
    map.on("style.load", render);
    render();

    return () => {
      map.off("load", render);
      map.off("style.load", render);
    };
  }, [analysis, forecastHour, mapReady, showHeatmap]);

  // Frame all routes once per analysis, and again whenever the pane is resized.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }
    const fit = () => {
      const bounds = new maplibregl.LngLatBounds();
      analysis.routes.forEach((route) =>
        route.geometry.coordinates.forEach((coordinate) => bounds.extend(coordinate)),
      );
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: { top: 60, right: 60, bottom: 150, left: 60 },
          duration: 700,
        });
      }
    };
    fit();
    map.on("resize", fit);
    return () => {
      map.off("resize", fit);
    };
  }, [analysis, mapReady]);

  return (
    <div className="absolute inset-0">
      <div className="h-full w-full" ref={containerRef} />
      {mapError && (
        <p
          className="absolute left-3 right-16 top-3 z-10 border border-destructive/40 bg-background/90 px-2.5 py-1.5 font-mono text-[10px] text-destructive"
          role="status"
        >
          {mapError}
        </p>
      )}
    </div>
  );
}

export default RouteAnalysisMap;
