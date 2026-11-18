import { RISK_COLORS } from "./riskColors";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type RiskRulesProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const columns = ["Low", "Moderate", "High", "Severe", "No Travel"] as const;

const rows = [
  { condition: "Wind (mph)", values: ["< 25", "25–34", "35–44", "45–54", "≥ 55"] },
  { condition: "Rain (in/hr)", values: ["< 0.10", "0.10–0.25", "0.25–0.50", "0.50–1.00", "> 1.00"] },
  { condition: "Snow (in/hr)", values: ["< 0.5", "0.5–1.0", "1.0–2.0", "2.0–3.0", "> 3.0"] },
];

const loadRules = [
  "Wind ≥ 55 mph — No Travel at any load.",
  "Wind 45–54 mph above 30,000 lb — No Travel.",
  "Wind 35–44 mph above 40,000 lb — Severe.",
];

function RiskRules({ open, onOpenChange }: RiskRulesProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-l border-border bg-card p-0 sm:max-w-[470px]"
      >
        <SheetHeader className="border-b border-border px-5 pb-4 pt-5 text-left">
          <span className="micro-label">Policy reference</span>
          <SheetTitle className="font-display text-[20px] uppercase tracking-[0.14em]">
            Risk rules
          </SheetTitle>
          <SheetDescription className="text-[11.5px] leading-relaxed text-muted-foreground">
            Each checkpoint is classified on wind, rain, and snow; the load overrides apply after
            that, and the worst component sets the checkpoint level.
          </SheetDescription>
        </SheetHeader>

        <div className="px-5 py-4">
          <section className="pb-4">
            <h3 className="micro-label mb-2">Thresholds</h3>
            <div className="border border-border">
              <Table className="text-[11px]">
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="h-8 px-2 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                      Condition
                    </TableHead>
                    {columns.map((column) => (
                      <TableHead
                        key={column}
                        className="h-8 px-2 font-mono text-[9px] uppercase tracking-[0.1em]"
                        style={{ color: RISK_COLORS[column] }}
                      >
                        {column}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.condition} className="border-border hover:bg-transparent">
                      <TableHead className="h-9 whitespace-nowrap px-2 text-[10.5px] font-medium text-muted-foreground">
                        {row.condition}
                      </TableHead>
                      {row.values.map((value) => (
                        <TableCell
                          key={value}
                          className="h-9 px-2 font-mono text-[10.5px] tabular-nums text-foreground"
                        >
                          {value}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <Separator />

          <section className="py-4">
            <h3 className="micro-label mb-2">Load overrides</h3>
            <ul className="flex flex-col gap-1.5">
              {loadRules.map((rule) => (
                <li
                  key={rule}
                  className="flex gap-2 text-[11.5px] leading-relaxed text-muted-foreground"
                >
                  <span className="mt-1.5 block size-1 shrink-0 bg-primary" aria-hidden="true" />
                  {rule}
                </li>
              ))}
            </ul>
          </section>

          <Separator />

          <section className="py-4">
            <h3 className="micro-label mb-2">Recommendation order</h3>
            <ol className="flex list-decimal flex-col gap-1.5 pl-4 text-[11.5px] leading-relaxed text-muted-foreground">
              <li>Exclude routes with No Travel miles while a safe alternative exists.</li>
              <li>Prefer routes with complete forecast coverage.</li>
              <li>
                Then compare Severe miles, High miles, distance-weighted average risk, and travel
                time — in that order.
              </li>
            </ol>
          </section>

          <Separator />

          <section className="pt-4">
            <h3 className="micro-label mb-2">Aggregation</h3>
            <ul className="flex flex-col gap-1.5">
              <li className="flex gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
                <span className="mt-1.5 block size-1 shrink-0 bg-primary" aria-hidden="true" />
                Each segment inherits the worse risk of its two endpoint checkpoints.
              </li>
              <li className="flex gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
                <span className="mt-1.5 block size-1 shrink-0 bg-primary" aria-hidden="true" />
                Risk miles are summed per level; average risk is distance-weighted.
              </li>
              <li className="flex gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
                <span className="mt-1.5 block size-1 shrink-0 bg-primary" aria-hidden="true" />
                Missing, negative, or non-finite weather becomes Unknown — never Low.
              </li>
            </ul>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default RiskRules;
