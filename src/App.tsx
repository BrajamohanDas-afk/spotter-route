import { useState } from "react";
import { Route, ShieldAlert } from "lucide-react";

import RiskRules from "./RiskRules";
import RoutePlanner from "./RoutePlanner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

function App() {
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="flex min-h-dvh flex-col bg-background lg:h-dvh lg:overflow-hidden">
      <header className="flex h-[58px] shrink-0 items-center justify-between gap-3 border-b border-border bg-card/60 px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-sm border border-border bg-background text-foreground">
            <Route size={17} strokeWidth={2} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="whitespace-nowrap font-display text-[17px] font-semibold uppercase leading-none tracking-[0.2em]">
              Spotter Route
            </p>
            <p className="mt-1 hidden whitespace-nowrap font-mono text-[9px] uppercase tracking-label text-muted-foreground sm:block">
              Weather-aware routing
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-2 rounded-sm border border-border bg-background px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground xl:inline-flex">
            TZ {timezone}
          </span>
          <span className="hidden items-center gap-2 rounded-sm border border-border bg-background px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground sm:inline-flex">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-pulse-dot rounded-full bg-risk-low" />
            </span>
            3-route analysis
          </span>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-border font-display text-[13px] uppercase tracking-[0.14em]"
            onClick={() => setIsRulesOpen(true)}
          >
            <ShieldAlert size={14} aria-hidden="true" />
            Risk rules
          </Button>
        </div>
      </header>

      <RoutePlanner />

      <footer className="shrink-0 bg-card/40">
        <Separator />
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-1.5 font-mono text-[9px] uppercase leading-relaxed tracking-[0.08em] text-muted-foreground">
          <span className="max-w-[520px]">
            Forecast-based planning aid — not a guarantee of road or vehicle safety.
          </span>
          <span>Routing © TomTom · Weather © Open-Meteo · Basemap © OpenStreetMap</span>
        </div>
      </footer>

      <RiskRules open={isRulesOpen} onOpenChange={setIsRulesOpen} />
    </div>
  );
}

export default App;
