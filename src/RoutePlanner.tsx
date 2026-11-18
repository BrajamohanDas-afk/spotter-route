import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  CalendarDays,
  CloudSun,
  MapPin,
  Pause,
  Play,
  Route,
  TriangleAlert,
  Waypoints,
  Weight,
} from "lucide-react";

import { createRouteAnalysis, RouteAnalysisApiError } from "./api/routeAnalysis";
import { RISK_COLORS, RISK_KEYS, RISK_ORDER, ROUTE_COLORS } from "./riskColors";
import type { CheckpointInterval, RouteAnalysis, RouteAnalysisRequest } from "./types/analysis";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const RouteAnalysisMap = lazy(() => import("./components/RouteAnalysisMap"));

type PlannerInput = {
  origin: string;
  destination: string;
  departure: string;
  loadWeight: number;
  checkpointInterval: CheckpointInterval;
};

function tomorrowAtEight(): string {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  value.setHours(8, 0, 0, 0);
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

const defaultInput: PlannerInput = {
  origin: "Denver, Colorado",
  destination: "Salt Lake City, Utah",
  departure: tomorrowAtEight(),
  loadWeight: 35_000,
  checkpointInterval: 25,
};

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

function formatDateTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  }).format(new Date(value));
}

function RoutePlanner() {
  const [formInput, setFormInput] = useState<PlannerInput>(defaultInput);
  const [analysis, setAnalysis] = useState<RouteAnalysis | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [forecastHour, setForecastHour] = useState(0);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const selectedRoute = useMemo(
    () => analysis?.routes.find((route) => route.id === selectedRouteId) ?? analysis?.routes[0] ?? null,
    [analysis, selectedRouteId],
  );

  useEffect(() => {
    if (!isPlaying || !analysis) {
      return;
    }
    const timer = window.setInterval(() => {
      setForecastHour((hour) => (hour + 1) % 49);
    }, 620);
    return () => window.clearInterval(timer);
  }, [isPlaying, analysis]);

  function updateInput<Key extends keyof PlannerInput>(key: Key, value: PlannerInput[Key]): void {
    setFormInput((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setIsLoading(true);
    setError(null);
    setIsPlaying(false);
    const request: RouteAnalysisRequest = {
      origin: formInput.origin.trim(),
      destination: formInput.destination.trim(),
      departure_time: new Date(formInput.departure).toISOString(),
      departure_timezone: timezone,
      load_weight_lb: formInput.loadWeight,
      checkpoint_interval_miles: formInput.checkpointInterval,
    };
    try {
      const result = await createRouteAnalysis(request, controller.signal);
      setAnalysis(result);
      setSelectedRouteId(result.recommendation.route_id ?? result.routes[0]?.id ?? "");
      setForecastHour(0);
      setShowHeatmap(true);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        return;
      }
      setError(
        caught instanceof RouteAnalysisApiError || caught instanceof Error
          ? caught.message
          : "The route analysis could not be completed.",
      );
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setIsLoading(false);
      }
    }
  }

  return (
    <main className="flex flex-1 flex-col lg:min-h-0 lg:flex-row lg:overflow-hidden">
      <aside className="flex w-full shrink-0 flex-col border-b border-border bg-card/40 lg:h-full lg:w-[406px] lg:border-b-0 lg:border-r">
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col">
            <section className="px-4 py-4">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <span className="micro-label">Trip inputs</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">
                  {formInput.checkpointInterval} mi sampling
                </span>
              </div>

              <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="origin" className="micro-label">
                    Origin
                  </Label>
                  <div className="relative">
                    <MapPin
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="origin"
                      className="h-10 rounded-sm border-input bg-background pl-9 text-[13.5px]"
                      type="text"
                      value={formInput.origin}
                      onChange={(event) => updateInput("origin", event.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="destination" className="micro-label">
                    Destination
                  </Label>
                  <div className="relative">
                    <MapPin
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="destination"
                      className="h-10 rounded-sm border-input bg-background pl-9 text-[13.5px]"
                      type="text"
                      value={formInput.destination}
                      onChange={(event) => updateInput("destination", event.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="departure" className="micro-label">
                    Departure
                  </Label>
                  <div className="relative">
                    <CalendarDays
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="departure"
                      className="h-10 rounded-sm border-input bg-background pl-9 font-mono text-[12.5px]"
                      type="datetime-local"
                      value={formInput.departure}
                      onChange={(event) => updateInput("departure", event.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="load" className="micro-label">
                      Load (lb)
                    </Label>
                    <div className="relative">
                      <Weight
                        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        id="load"
                        className="h-10 rounded-sm border-input bg-background pl-9 font-mono text-[13px]"
                        type="number"
                        min="0"
                        max="200000"
                        step="500"
                        value={formInput.loadWeight}
                        onChange={(event) => updateInput("loadWeight", Number(event.target.value))}
                        required
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="interval" className="micro-label">
                      Checkpoints
                    </Label>
                    <Select
                      value={String(formInput.checkpointInterval)}
                      onValueChange={(value) =>
                        updateInput("checkpointInterval", Number(value) as CheckpointInterval)
                      }
                    >
                      <SelectTrigger
                        id="interval"
                        className="h-10 rounded-sm border-input bg-background font-mono text-[12px]"
                      >
                        <Waypoints className="size-4 text-muted-foreground" aria-hidden="true" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">Every 10 mi</SelectItem>
                        <SelectItem value="25">Every 25 mi</SelectItem>
                        <SelectItem value="50">Every 50 mi</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {error && (
                  <p
                    role="alert"
                    className="flex items-start gap-2 border border-destructive/40 bg-destructive/10 p-2.5 text-[12px] leading-relaxed text-destructive"
                  >
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="mt-1 h-11 w-full gap-2 rounded-sm font-display text-[14px] uppercase tracking-[0.18em]"
                >
                  {isLoading ? (
                    <>
                      <span
                        className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                        aria-hidden="true"
                      />
                      Analyzing
                    </>
                  ) : (
                    <>
                      <Route className="size-4" aria-hidden="true" />
                      Analyze routes
                    </>
                  )}
                </Button>
              </form>
            </section>

            <Separator />

            <section className="px-4 py-4" aria-busy={isLoading}>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <span className="micro-label">Routes</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">
                  {analysis ? `${analysis.routes.length} options` : "no analysis"}
                </span>
              </div>

              {!analysis ? (
                <div className="flex flex-col items-center gap-2 border border-dashed border-border px-4 py-9 text-center">
                  <Route className="size-5 text-muted-foreground/60" aria-hidden="true" />
                  <p className="font-display text-[15px] uppercase tracking-[0.12em] text-muted-foreground">
                    No trip analyzed
                  </p>
                  <p className="max-w-[260px] text-[11.5px] leading-relaxed text-muted-foreground/80">
                    Submit the form to compare three truck routes with ETA-matched weather, risk
                    miles, and a safety recommendation.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.04em] text-muted-foreground">
                    <span className="truncate">{analysis.places.origin.label}</span>
                    <span aria-hidden="true" className="text-muted-foreground/50">
                      →
                    </span>
                    <span className="truncate">{analysis.places.destination.label}</span>
                  </p>

                  <div
                    className={cn(
                      "border-l-2 bg-background/50 px-3 py-2.5",
                      analysis.recommendation.route_id
                        ? "border-l-primary/70"
                        : "border-l-destructive",
                    )}
                  >
                    <span className="micro-label">Recommendation</span>
                    <p className="mt-1 text-[12px] leading-relaxed text-foreground/90">
                      {analysis.recommendation.route_id ? (
                        <span className="font-mono text-primary">
                          {analysis.recommendation.route_id}
                        </span>
                      ) : (
                        <span className="font-mono text-destructive">No recommendation</span>
                      )}
                      {" — "}
                      {analysis.recommendation.explanation.replace(
                        /^Route [A-C] is recommended because /,
                        "",
                      )}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    {analysis.routes.map((routeOption, index) => {
                      const isRecommended = analysis.recommendation.route_id === routeOption.id;
                      const total = routeOption.distance_miles || 1;
                      return (
                        <button
                          className={cn(
                            "animate-rise border bg-background/40 p-3 text-left transition-colors duration-150",
                            selectedRoute?.id === routeOption.id
                              ? "border-primary/50 bg-secondary/60"
                              : "border-border hover:border-input hover:bg-secondary/40",
                          )}
                          key={routeOption.id}
                          onClick={() => setSelectedRouteId(routeOption.id)}
                          style={
                            {
                              animationDelay: `${index * 70}ms`,
                              borderLeftColor: ROUTE_COLORS[index],
                              borderLeftWidth: "2px",
                            } as CSSProperties
                          }
                          type="button"
                        >
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
                              {routeOption.id}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-display text-[15px] uppercase tracking-[0.06em]">
                              {routeOption.label}
                            </span>
                            {isRecommended && (
                              <Badge className="rounded-sm px-1.5 py-0 font-mono text-[9px] font-semibold uppercase tracking-[0.12em]">
                                Best
                              </Badge>
                            )}
                            {!routeOption.eligible && (
                              <Badge
                                variant="destructive"
                                className="rounded-sm px-1.5 py-0 font-mono text-[9px] uppercase tracking-[0.12em]"
                              >
                                No travel
                              </Badge>
                            )}
                          </span>

                          <span className="mt-2.5 grid grid-cols-3 gap-2">
                            <span className="flex flex-col">
                              <span className="font-mono text-[13px] tabular-nums">
                                {routeOption.distance_miles.toFixed(1)} mi
                              </span>
                              <span className="micro-label mt-0.5 text-[8.5px]">Distance</span>
                            </span>
                            <span className="flex flex-col">
                              <span className="font-mono text-[13px] tabular-nums">
                                {formatDuration(routeOption.duration_minutes)}
                              </span>
                              <span className="micro-label mt-0.5 text-[8.5px]">Travel</span>
                            </span>
                            <span className="flex flex-col">
                              <span className="font-mono text-[13px] tabular-nums">
                                {routeOption.average_risk === null
                                  ? "—"
                                  : `${routeOption.average_risk.toFixed(2)} / 4`}
                              </span>
                              <span className="micro-label mt-0.5 text-[8.5px]">Avg risk</span>
                            </span>
                          </span>

                          <span
                            className="mt-2.5 flex h-1.5 gap-px overflow-hidden"
                            aria-hidden="true"
                          >
                            {RISK_KEYS.map((key) => (
                              <span
                                className="block h-full"
                                key={key}
                                style={
                                  {
                                    backgroundColor: RISK_COLORS[RISK_ORDER[RISK_KEYS.indexOf(key)]],
                                    width: `${(routeOption.risk_miles[key] / total) * 100}%`,
                                  } as CSSProperties
                                }
                              />
                            ))}
                          </span>

                          <span className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1">
                            {RISK_KEYS.map((key, riskIndex) => (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 font-mono text-[9.5px] text-muted-foreground",
                                  routeOption.risk_miles[key] === 0 && "opacity-35",
                                )}
                                key={key}
                              >
                                <span
                                  className="block size-1.5"
                                  style={{ backgroundColor: RISK_COLORS[RISK_ORDER[riskIndex]] }}
                                  aria-hidden="true"
                                />
                                {Math.round(routeOption.risk_miles[key])} {RISK_ORDER[riskIndex]}
                              </span>
                            ))}
                          </span>

                          <span className="mt-2 flex items-center justify-between gap-2 border-t border-border/70 pt-1.5 font-mono text-[9.5px] uppercase tracking-[0.04em] text-muted-foreground">
                            <span>{formatDateTime(routeOption.arrival_time, timezone)}</span>
                            <span>
                              {routeOption.checkpoints.length} CP ·{" "}
                              {routeOption.complete ? "complete" : "incomplete"}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {analysis.warnings.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {analysis.warnings.map((warning) => (
                        <p
                          className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-risk-moderate"
                          key={warning}
                        >
                          <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                          {warning}
                        </p>
                      ))}
                    </div>
                  )}

                  <p className="font-mono text-[9px] uppercase leading-relaxed tracking-[0.05em] text-muted-foreground/70">
                    {analysis.attribution.join(" · ")} · generated{" "}
                    {formatDateTime(analysis.generated_at, timezone)}
                  </p>
                </div>
              )}
            </section>
          </div>
        </ScrollArea>
      </aside>

      <section className="relative flex min-h-[64vh] flex-1 flex-col lg:min-h-0" aria-label="Route and weather map">
        <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border bg-card/50 px-3.5">
          <div className="min-w-0">
            <p className="truncate font-display text-[14px] uppercase leading-none tracking-[0.14em]">
              {selectedRoute ? selectedRoute.label : "Trip corridor"}
            </p>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
              {analysis
                ? `${selectedRoute?.checkpoints.length ?? 0} checkpoints · ETA-matched weather`
                : "Awaiting analysis"}
            </p>
          </div>

          <Button
            variant={showHeatmap ? "secondary" : "outline"}
            size="sm"
            aria-pressed={showHeatmap}
            disabled={!analysis}
            onClick={() => setShowHeatmap((visible) => !visible)}
            className="h-7 gap-1.5 rounded-sm px-2 font-mono text-[10px] uppercase tracking-[0.1em]"
          >
            <CloudSun size={13} aria-hidden="true" />
            Heatmap
          </Button>
        </div>

        <div className="relative min-h-0 flex-1">
          {analysis && selectedRoute ? (
            <>
              <Suspense
                fallback={
                  <div className="grid h-full place-items-center text-[12px] text-muted-foreground">
                    Loading map…
                  </div>
                }
              >
                <RouteAnalysisMap
                  analysis={analysis}
                  selectedRouteId={selectedRoute.id}
                  forecastHour={forecastHour}
                  showHeatmap={showHeatmap}
                  timezone={timezone}
                />
              </Suspense>

              <div className="absolute inset-x-2 bottom-2 z-10 border border-border bg-card/95 p-2 backdrop-blur-sm sm:inset-x-3 sm:bottom-3 sm:p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="micro-label flex items-center gap-1.5 whitespace-nowrap">
                    <CloudSun size={12} aria-hidden="true" />
                    Forecast corridor
                  </span>
                  <span className="max-w-[62%] truncate text-right font-mono text-[10px] tabular-nums text-foreground sm:text-[10.5px]">
                    +{forecastHour}h ·{" "}
                    {formatDateTime(analysis.heatmap.timestamps[forecastHour], timezone)}
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-3">
                  <Button
                    type="button"
                    size="icon"
                    className="size-7 shrink-0 rounded-full"
                    aria-label={isPlaying ? "Pause forecast playback" : "Play forecast playback"}
                    onClick={() => setIsPlaying((playing) => !playing)}
                  >
                    {isPlaying ? (
                      <Pause className="size-3" fill="currentColor" aria-hidden="true" />
                    ) : (
                      <Play className="size-3" fill="currentColor" aria-hidden="true" />
                    )}
                  </Button>

                  <Slider
                    className="flex-1"
                    aria-label="Forecast hour"
                    aria-valuetext={`Plus ${forecastHour} hours`}
                    disabled={!showHeatmap}
                    min={0}
                    max={48}
                    step={1}
                    value={[forecastHour]}
                    onValueChange={([hour]) => setForecastHour(hour)}
                  />

                  <span className="w-14 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                    {forecastHour}/48h
                  </span>
                </div>

                <div className="mt-1 hidden items-center justify-between font-mono text-[8.5px] text-muted-foreground/60 sm:flex">
                  <span>0h</span>
                  <span>12h</span>
                  <span>24h</span>
                  <span>36h</span>
                  <span>48h</span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 border-t border-border pt-1.5 sm:mt-2 sm:gap-x-3 sm:gap-y-1 sm:pt-2">
                  {RISK_ORDER.map((label) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground"
                    >
                      <span
                        className="block size-1.5 rounded-full"
                        style={{ backgroundColor: RISK_COLORS[label] }}
                        aria-hidden="true"
                      />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="relative grid h-full place-items-center overflow-hidden px-6">
              <div className="rule-grid pointer-events-none absolute inset-0" aria-hidden="true" />
              <div className="relative flex max-w-[320px] flex-col items-center gap-2 text-center">
                <MapPin className="size-6 text-muted-foreground/60" aria-hidden="true" />
                <p className="font-display text-[16px] uppercase tracking-[0.14em] text-muted-foreground">
                  Corridor map
                </p>
                <p className="text-[11.5px] leading-relaxed text-muted-foreground/80">
                  Three routes, risk-coloured checkpoints with ETAs, and the 0–48 hour weather
                  corridor render here once the trip is analyzed.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default RoutePlanner;
