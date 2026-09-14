import { useCallback, useEffect, useState } from "react";
import {
  Area,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  type DefaultLegendContentProps,
} from "recharts";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info, X } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { colors } from "@/lib/colors";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import type { Aircraft, ForecastResult, ForecastSeries } from "@/types";

type ChartPoint = {
  x: number;
  hist?: number;
  pred?: number;
  fut?: number;
  ci0?: number | null;
  ci1?: number | null;
};

// Donnees par serie : historique + regression + projection, avec l'intervalle
// de confiance (borne basse ci0 et largeur ci1 pour un remplissage par empilement).
function seriesChartData(s: ForecastSeries): ChartPoint[] {
  const n = s.history.length;
  const data: ChartPoint[] = [];
  for (let i = 0; i < n; i++) data.push({ x: i + 1, hist: s.history[i], pred: s.y_pred[i] });
  for (let i = 0; i < s.y_future.length; i++) {
    const low = s.ci_lower?.[i];
    const high = s.ci_upper?.[i];
    data.push({
      x: n + i + 1,
      fut: s.y_future[i],
      ci0: low ?? null,
      ci1: low != null && high != null ? high - low : null,
    });
  }
  return data;
}

function formatVal(v: number, unit: string) {
  if (unit === "%") return `${v.toFixed(1)}%`;
  return `${Math.round(v).toLocaleString("fr-FR")} ${unit.trim()}`;
}

function formatP(p: number) {
  if (!Number.isFinite(p)) return "n/a";
  return p < 0.001 ? "<0.001" : p.toFixed(3);
}

// Series nommees "profit" (ou contenant "profit") pour l'interpretation.
function findProfitSeries(series: ForecastSeries[]) {
  return (
    series.find((s) => s.name.toLowerCase().includes("profit")) ??
    series.find((s) => s.name.toLowerCase().includes("marge")) ??
    series[0]
  );
}

// Legende custom : exclut les series internes de l'intervalle de confiance.
function renderForecastLegend(props: DefaultLegendContentProps) {
  const items = (props.payload ?? []).filter(
    (p) => String(p.dataKey) !== "ci0" && String(p.dataKey) !== "ci1"
  );
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-3 text-[11px] text-muted-foreground">
      {items.map((p) => (
        <li key={String(p.dataKey ?? p.value)} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-0.5 w-4 rounded-full"
            style={{ background: p.color }}
          />
          {String(p.value ?? p.dataKey ?? "")}
        </li>
      ))}
    </ul>
  );
}

// Projection fixe : le backend prolonge la regression sur ce nombre de vols.
const FORECAST_HORIZON = 5;

// Titre de l'axe X, affiche en HTML sous le graphique (plus fiable que le
// rendu SVG des libelles d'axes de Recharts).
const X_AXIS_TITLE = "N° du vol";

export default function ForecastPage() {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [aircraftId, setAircraftId] = useState<string>("all");
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);

  useEffect(() => {
    apiGet<Aircraft[]>("/aircraft")
      .then(setAircraft)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoadingList(false));
  }, []);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiPost<ForecastResult>("/forecast", {
        aircraft_id: aircraftId === "all" ? null : Number(aircraftId),
      });
      setResult(res);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [aircraftId]);

  const trendIcon = (t: string) => (t === "hausse" ? "↗" : t === "baisse" ? "↘" : "→");

  const profitSeries = result ? findProfitSeries(result.series) : null;
  const profitNext = profitSeries ? profitSeries.y_future[0] : 0;
  const profitLast = profitSeries ? profitSeries.history[profitSeries.history.length - 1] : 0;
  const profitVariationPct =
    profitSeries && profitLast !== 0 ? ((profitNext - profitLast) / Math.abs(profitLast)) * 100 : 0;

  let insight: { text: string; tone: "success" | "destructive" | "muted" } | null = null;
  if (profitSeries) {
    const dir = profitSeries.trend === "hausse" ? "hausse" : profitSeries.trend === "baisse" ? "baisse" : "stable";
    const tone: "success" | "destructive" | "muted" =
      dir === "hausse" ? "success" : dir === "baisse" ? "destructive" : "muted";
    if (dir === "hausse") {
      insight = {
        tone,
        text: `Le profit de cet avion est en hausse : une augmentation de ${Math.abs(profitVariationPct).toFixed(1)}% est attendue sur les prochains vols.`,
      };
    } else if (dir === "baisse") {
      insight = {
        tone,
        text: `Le profit de cet avion est en baisse : une diminution de ${Math.abs(profitVariationPct).toFixed(1)}% est attendue sur les prochains vols.`,
      };
    } else {
      insight = {
        tone,
        text: "Le profit de cet avion est stable : aucune evolution significative n'est attendue sur les prochains vols.",
      };
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prevision de Rentabilite"
        description="Projetez la rentabilite future en ajustant une regression lineaire sur les resultats historiques de chaque vol (avion selectionne ou toute la flotte)."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        {/* Colonne gauche : réglages */}
        <div className="space-y-4">
          <Explainer title="De quoi s'agit-il ?">
            Cet outil prolonge la <strong>tendance historique</strong> de vos vols pour estimer le futur
            (remplissage, carburant, revenu, profit) sur les prochains vols, avec l'incertitude
            statistique (p-value et intervalle de confiance a 95 %).
          </Explainer>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Paramètres</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-1.5">
                <Label>Avion</Label>
                <Select value={aircraftId} onValueChange={setAircraftId}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les avions</SelectItem>
                    {aircraft.filter((a) => a.capacity > 0).map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={run} disabled={loading}>
                {loading ? "Calcul..." : "Lancer la Prevision"}
              </Button>
              <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                Projection fixe sur les {FORECAST_HORIZON} prochains vols, a partir de tous les vols de l'appareil.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Colonne droite : résultats */}
        <div className="space-y-4">
          {loadingList ? (
            <LoadingSkeleton cards={4} />
          ) : result ? (
            <>
              {insight && (
                <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm" role="status">
                  <span className="mt-0.5 shrink-0" style={{ color: insight.tone === "success" ? colors.success : insight.tone === "destructive" ? colors.destructive : colors.muted }}>
                    {insight.tone === "success" ? "↗" : insight.tone === "destructive" ? "↘" : "→"}
                  </span>
                  <p className="leading-relaxed">
                    <span className="font-semibold">Interpretation : </span>
                    {insight.text}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {result.series.map((s) => {
                  const last = s.history[s.history.length - 1];
                  const next = s.y_future[0];
                  const variation = last !== 0 ? ((next - last) / Math.abs(last)) * 100 : 0;
                  const p = s.p_value ?? 1;
                  return (
                    <Card key={s.name}>
                      <CardContent className="p-4">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">{s.name}</div>
                        <div className="mt-1 text-xl font-semibold" style={{ color: s.color }}>
                          {formatVal(next, s.unit)}
                        </div>
                        <div className="text-xs font-semibold" style={{ color: variation >= 0 ? colors.success : colors.destructive }}>
                          {variation >= 0 ? "+" : ""}{variation.toFixed(1)}% vs dernier vol
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span>{trendIcon(s.trend)} {s.trend}</span>
                          <span className="text-muted-foreground/60">·</span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex cursor-help items-center gap-0.5">
                                  R² = {s.r2}
                                  <Info className="h-3 w-3" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>R² proche de 1 = bonne correlation</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <span className="text-muted-foreground/60">·</span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="inline-flex cursor-help items-center gap-0.5"
                                  style={{ color: p < 0.05 ? colors.success : colors.muted }}
                                >
                                  p ≈ {formatP(p)}
                                  <Info className="h-3 w-3" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {p < 0.05
                                  ? "Tendance significative (test de la pente, p < 0.05)"
                                  : "Tendance non significative (test de la pente, p >= 0.05)"}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {result.series.map((s) => (
                  <Card key={s.name}>
                    <CardHeader>
                      <CardTitle className="text-base">{s.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-2">
                        {/* Titre de l'axe Y, vertical a gauche (en HTML, hors SVG) */}
                        <div
                          className="flex h-[240px] w-4 shrink-0 items-center justify-center"
                          aria-hidden
                        >
                          <span
                            className="text-[11px] leading-none text-muted-foreground"
                            style={{ writingMode: "vertical-lr" }}
                          >
                            {s.unit.trim() === "%" ? "Valeur (%)" : "Montant (MAD)"}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <ResponsiveContainer width="100%" height={240}>
                            <LineChart data={seriesChartData(s)} margin={{ top: 6, right: 10, bottom: 24, left: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                              {/* Bande de confiance 95 % : empilement (borne basse invisible + largeur visible) */}
                              <Area type="linear" dataKey="ci0" stackId="band" stroke="none" fill="none" />
                              <Area type="linear" dataKey="ci1" stackId="band" stroke="none" fill={s.color} fillOpacity={0.16} />
                              <XAxis dataKey="x" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={70} />
                              <RechartsTooltip />
                              <Legend content={renderForecastLegend} />
                              <Line type="monotone" dataKey="hist" name="Historique" stroke={s.color} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                              <Line type="linear" dataKey="pred" name="Regression" stroke="hsl(var(--muted-foreground))" strokeWidth={1.2} strokeDasharray="5 5" dot={false} connectNulls />
                              <Line type="linear" dataKey="fut" name="Prevision" stroke={colors.primary} strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} connectNulls />
                            </LineChart>
                          </ResponsiveContainer>
                          {/* Titre de l'axe X, centre sous le graphique */}
                          <p className="mt-1 text-center text-[11px] text-muted-foreground" aria-hidden>
                            {X_AXIS_TITLE}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Tableau Recapitulatif des Previsions</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Indicateur</TableHead>
                        <TableHead className="text-right">Derniere valeur</TableHead>
                        <TableHead className="text-right">Vol N+1</TableHead>
                        <TableHead className="text-right">IC95 vol N+1</TableHead>
                        <TableHead className="text-right">Vol N+{result.horizon}</TableHead>
                        <TableHead>Tendance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.series.map((s) => {
                        const last = s.history[s.history.length - 1];
                        const trend = s.trend;
                        const trendColor = trend === "hausse" ? colors.success : trend === "baisse" ? colors.destructive : colors.muted;
                        const lo = s.ci_lower?.[0];
                        const hi = s.ci_upper?.[0];
                        return (
                          <TableRow key={s.name}>
                            <TableCell>{s.name}</TableCell>
                            <TableCell className="text-right">{formatVal(last, s.unit)}</TableCell>
                            <TableCell className="text-right">{formatVal(s.y_future[0], s.unit)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {lo != null && hi != null
                                ? `[${formatVal(lo, s.unit)} ; ${formatVal(hi, s.unit)}]`
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right">{formatVal(s.y_future[s.y_future.length - 1], s.unit)}</TableCell>
                            <TableCell style={{ color: trendColor }}>
                              {trendIcon(trend)} {trend === "hausse" ? "Hausse" : trend === "baisse" ? "Baisse" : "Stable"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : (
            <EmptyState
              title="Aucune prevision lancee"
              description="Selectionnez un avion (ou « Tous les avions ») puis lancez la prevision pour generer les projections sur les prochains vols."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Explainer({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <Card className="border-blue-500/30 bg-blue-500/5">
      <CardContent className="flex items-start gap-3 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <div className="flex-1 text-sm leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">{title}</span>{" "}
          {children}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Fermer"
          className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </CardContent>
    </Card>
  );
}
