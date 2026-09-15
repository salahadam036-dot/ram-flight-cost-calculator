import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Info, Lightbulb, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet, apiPost } from "@/lib/api";
import { colors } from "@/lib/colors";
import { cn, formatMoney, formatPct } from "@/lib/utils";
import type { Flight, KpiResult, MonteCarloResult, OptimizationResult } from "@/types";

export default function DecisionPage() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [flightId, setFlightId] = useState("");

  useEffect(() => {
    apiGet<Flight[]>("/flights").then((f) => {
      setFlights(f);
      // Auto-sélectionne le vol le plus rentable pour ne jamais démarrer vide.
      const best = [...f].sort(
        (a, b) => (b.profit_margin ?? -Infinity) - (a.profit_margin ?? -Infinity),
      )[0];
      if (best) setFlightId(String(best.id));
    }).catch((e) => toast.error((e as Error).message));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Risque & Rendement"
        description="Analysez un vol en profondeur : santé actuelle, risque potentiel, et meilleure décision tarifaire."
      />

      {/* Parcours en 3 étapes */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { n: 1, t: "Santé du vol", d: "Le vol gagne-t-il de l'argent aujourd'hui ?" },
          { n: 2, t: "Risque", d: "Quelle est la probabilité qu'il perde de l'argent ?" },
          { n: 3, t: "Optimisation", d: "Quel prix (et quel avion) maximisent le profit ?" },
        ].map((s) => (
          <div key={s.n} className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {s.n}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{s.t}</div>
              <div className="text-xs text-muted-foreground">{s.d}</div>
            </div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="kpi">
        <TabsList>
          <TabsTrigger value="kpi">Santé du vol</TabsTrigger>
          <TabsTrigger value="mc">Risque (Monte Carlo)</TabsTrigger>
          <TabsTrigger value="opt">Optimisation du prix</TabsTrigger>
        </TabsList>

        <TabsContent value="kpi">
          <KpiTab flights={flights} flightId={flightId} onFlightChange={setFlightId} />
        </TabsContent>
        <TabsContent value="mc">
          <MonteCarloTab flights={flights} flightId={flightId} onFlightChange={setFlightId} />
        </TabsContent>
        <TabsContent value="opt">
          <OptimizeTab flights={flights} flightId={flightId} onFlightChange={setFlightId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Composants partagés ─────────────────────────────────────────────────────

/** Bandeau pédagogique « En bref » qui explique l'outil en langage simple. */
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

/** Sélecteur de vol enrichi : affiche la marge de base à côté du numéro de vol. */
function FlightPicker({
  flights,
  value,
  onChange,
}: {
  flights: Flight[];
  value: string;
  onChange: (v: string) => void;
}) {
  const selected = flights.find((f) => String(f.id) === value);
  // Dédupe par numéro de vol (une entrée par route) et trie du plus rentable au
  // plus déficitaire, pour orienter le choix dès l'ouverture.
  const unique = useMemo(() => {
    const byNumber = new Map<string, Flight>();
    for (const f of flights) {
      // Exclut les vols cargo : l'analyse de risque/rendement s'applique aux
      // vols de passagers uniquement.
      if (f.passengers <= 0) continue;
      const existing = byNumber.get(f.flight_number);
      if (!existing || f.id > existing.id) byNumber.set(f.flight_number, f);
    }
    return Array.from(byNumber.values()).sort(
      (a, b) => (b.profit_margin ?? -Infinity) - (a.profit_margin ?? -Infinity),
    );
  }, [flights]);

  return (
    <div className="grid gap-2">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Choisir un vol…" />
        </SelectTrigger>
        <SelectContent className="max-h-[420px]">
          {unique.map((f) => {
            const margin = f.profit_margin;
            const prof = margin != null && margin >= 0;
            return (
              <SelectItem key={f.id} value={String(f.id)}>
                <span className="font-semibold">{f.flight_number}</span>
                <span className="text-muted-foreground"> · {f.departure_airport} → {f.arrival_airport}</span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      {selected ? (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">
              {selected.departure_airport_name ?? selected.departure_airport} →{" "}
              {selected.arrival_airport_name ?? selected.arrival_airport}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                selected.profit_margin != null && selected.profit_margin >= 0
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive",
              )}
            >
              {formatPct(selected.profit_margin)}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {selected.aircraft_model ?? "Avion ?"} · {selected.passengers} passagers · billet{" "}
            {formatMoney(selected.ticket_price_avg)}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
          Sélectionnez un vol pour voir son contexte (avion, passagers, tarif, marge).
        </div>
      )}
    </div>
  );
}

/** Carte d'un indicateur, avec un sous-titre en langage simple. */
function KpiCard({
  label,
  value,
  color,
  note,
}: {
  label: string;
  value: string;
  color: string;
  note?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-lg font-semibold" style={{ color }}>
          {value}
        </div>
        {note && <div className="mt-0.5 text-xs text-muted-foreground">{note}</div>}
      </CardContent>
    </Card>
  );
}

function Num({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(e.target.value)} className="w-full" />
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Bandeau de verdict / explication en langage simple. */
function Summary({
  tone,
  children,
}: {
  tone: "good" | "bad" | "warn";
  children: React.ReactNode;
}) {
  const palette = {
    good: { border: colors.success, bg: "rgba(16,185,129,0.12)", fg: "text-success" },
    bad: { border: colors.destructive, bg: "rgba(239,68,68,0.12)", fg: "text-destructive" },
    warn: { border: colors.warning, bg: "rgba(245,158,11,0.12)", fg: "text-warning" },
  }[tone];
  return (
    <div className="flex items-start gap-2 rounded-lg px-4 py-3 text-sm font-medium" style={{ background: palette.bg }}>
      <Lightbulb className={cn("mt-0.5 h-4 w-4 shrink-0", palette.fg)} />
      <div>{children}</div>
    </div>
  );
}

// ── Onglet 1 : Santé du vol (KPI) ──────────────────────────────────────────

function KpiTab({ flights, flightId, onFlightChange }: { flights: Flight[]; flightId: string; onFlightChange: (v: string) => void }) {
  const [kpi, setKpi] = useState<KpiResult | null>(null);

  const compute = async () => {
    if (!flightId) return;
    try {
      setKpi(await apiPost<KpiResult>("/decision/kpis", { flight_id: Number(flightId) }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const profitable = kpi ? kpi.marge_rask_cask > 0 : false;
  const aboveBreakEven = kpi ? kpi.load_factor >= kpi.belf : false;

  let insight = "";
  let tone: "good" | "bad" | "warn" = "good";
  if (kpi) {
    if (profitable && aboveBreakEven) {
      insight = "Ce vol gagne de l'argent et son taux de remplissage dépasse le seuil de rentabilité : solide.";
      tone = "good";
    } else if (profitable && !aboveBreakEven) {
      insight = "Ce vol gagne encore de l'argent, mais son remplissage est sous le seuil : il reste fragile.";
      tone = "warn";
    } else if (!profitable && aboveBreakEven) {
      insight = "Le remplissage est correct, mais chaque siège-km coûte plus qu'il ne rapporte : marge négative.";
      tone = "warn";
    } else {
      insight = "Ce vol perd de l'argent : le coût par siège-km dépasse le revenu, et le remplissage est insuffisant.";
      tone = "bad";
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
      {/* Colonne gauche : réglages / sélection */}
      <div className="space-y-4">
        <Explainer title="De quoi s'agit-il ?">
          Cet onglet mesure la <strong>santé actuelle</strong> d'un vol à l'aide d'indicateurs standardisés
          (par « siège-kilomètre »), afin de comparer des vols de tailles différentes.
        </Explainer>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sélection du vol</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <FlightPicker flights={flights} value={flightId} onChange={onFlightChange} />
            <Button className="w-full" onClick={compute}>Calculer</Button>
          </CardContent>
        </Card>
      </div>

      {/* Colonne droite : résultats */}
      <div className="space-y-4">
        {!kpi && (
          <EmptyState
            title="Aucun indicateur calculé"
            description="Sélectionnez un vol puis cliquez sur « Calculer » pour voir sa santé financière."
          />
        )}

        {kpi && (
          <>
            <Summary tone={tone}>{insight}</Summary>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Taux de remplissage" value={`${kpi.load_factor.toFixed(1)}%`} color={kpi.load_factor >= 70 ? colors.success : colors.destructive} note="Part des sièges vendus" />
              <KpiCard label="Seuil (BELF)" value={`${kpi.belf.toFixed(1)}%`} color={colors.warning} note="Remplissage nécessaire pour être rentable" />
              <KpiCard label="Revenu / siège-km (RASK)" value={`${kpi.rask.toFixed(4)}`} color={colors.success} note="Ce que rapporte chaque siège-km" />
              <KpiCard label="Coût / siège-km (CASK)" value={`${kpi.cask.toFixed(4)}`} color={colors.destructive} note="Ce que coûte chaque siège-km" />
              <KpiCard label="Marge unitaire" value={`${kpi.marge_rask_cask.toFixed(4)}`} color={profitable ? colors.success : colors.destructive} note="RASK − CASK (positif = rentable)" />
              <KpiCard label="Revenu / passager-km (Yield)" value={`${kpi.yield_val.toFixed(4)}`} color={colors.info} note="Recette moyenne par passager et par km" />
              <KpiCard label="Offre (ASK)" value={`${Math.round(kpi.ask).toLocaleString("fr-FR")} sk.km`} color={colors.warning} note="Sièges × distance (capacité offerte)" />
              <KpiCard label="Demande (RPK)" value={`${Math.round(kpi.rpk).toLocaleString("fr-FR")} pk.km`} color={colors.warning} note="Passagers × distance (vendue)" />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Revenu vs coût par siège-km</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-2 text-xs text-muted-foreground">
                    La barre verte (RASK) doit dépasser la rouge (CASK) pour que le vol soit rentable.
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={[{ name: "Par siège-km", RASK: kpi.rask, CASK: kpi.cask }]} layout="vertical" margin={{ left: 16, right: 32 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={110} />
                      <RechartsTooltip />
                      <Bar dataKey="RASK" fill={colors.success} name="Revenu (RASK)" opacity={0.85} barSize={22} />
                      <Bar dataKey="CASK" fill={colors.destructive} name="Coût (CASK)" opacity={0.85} barSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Remplissage vs seuil de rentabilité</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-2 text-xs text-muted-foreground">
                    Votre taux de remplissage réel doit dépasser le seuil (BELF) pour couvrir les coûts fixes.
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={[{ name: "Remplissage (%)", "Réel": kpi.load_factor, "Seuil": kpi.belf }]} layout="vertical" margin={{ left: 16, right: 32 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={110} />
                      <RechartsTooltip />
                      <Bar dataKey="Réel" fill={aboveBreakEven ? colors.success : colors.destructive} name="Remplissage réel" opacity={0.85} barSize={22} />
                      <Bar dataKey="Seuil" fill={colors.warning} name="Seuil (BELF)" opacity={0.85} barSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Onglet 2 : Risque (Monte Carlo) ──────────────────────────────────────

function MonteCarloTab({ flights, flightId, onFlightChange }: { flights: Flight[]; flightId: string; onFlightChange: (v: string) => void }) {
  const [nSims, setNSims] = useState("5000");
  const [fuelStd, setFuelStd] = useState("10");
  const [paxStd, setPaxStd] = useState("10");
  const [ticketStd, setTicketStd] = useState("10");
  const [mc, setMc] = useState<MonteCarloResult | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!flightId) return;
    setLoading(true);
    try {
      setMc(
        await apiPost<MonteCarloResult>("/decision/monte-carlo", {
          flight_id: Number(flightId),
          n_sims: Number(nSims) || 5000,
          fuel_std_pct: Number(fuelStd) || 10,
          pax_std_pct: Number(paxStd) || 10,
          ticket_std_pct: Number(ticketStd) || 10,
        }),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
      {/* Colonne gauche : réglages */}
      <div className="space-y-4">
        <Explainer title="De quoi s'agit-il ?">
          La vie réelle est incertaine : le carburant, les passagers et le prix du billet varient. Cet outil
          rejoue le vol <strong>{nSims || "5000"} fois</strong> en faisant varier ces trois facteurs, puis
          compte la part de scénarios qui <strong>perdent de l'argent</strong>. C'est votre mesure du risque.
        </Explainer>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Paramètres</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FlightPicker flights={flights} value={flightId} onChange={onFlightChange} />
            <Num label="Nombre de simulations" value={nSims} onChange={setNSims} hint="Plus élevé = plus précis" />
            <Num label="Incertitude carburant (%)" value={fuelStd} onChange={setFuelStd} hint="Variation possible du prix" />
            <Num label="Incertitude passagers (%)" value={paxStd} onChange={setPaxStd} hint="Variation du remplissage" />
            <Num label="Incertitude billet (%)" value={ticketStd} onChange={setTicketStd} hint="Variation du tarif" />
            <Button className="w-full" onClick={run} disabled={loading}>
              {loading ? "Calcul..." : "Lancer l'analyse"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Colonne droite : résultats */}
      <div className="space-y-4">
        {!mc && (
          <EmptyState
            title="Aucune analyse de risque"
            description="Sélectionnez un vol puis cliquez sur « Lancer l'analyse » pour estimer la probabilité de perte."
          />
        )}

        {mc && (
          <>
            <Summary tone={mc.prob_loss < 20 ? "good" : mc.prob_loss < 40 ? "warn" : "bad"}>
              {mc.verdict} — il y a {mc.prob_loss.toFixed(1)}% de chances que ce vol soit déficitaire.
            </Summary>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Profit moyen attendu" value={formatMoney(mc.mean_profit)} color={mc.mean_profit > 0 ? colors.success : colors.destructive} note="Résultat moyen sur tous les scénarios" />
              <KpiCard label="Probabilité de perte" value={`${mc.prob_loss.toFixed(1)}%`} color={mc.prob_loss < 20 ? colors.success : mc.prob_loss < 40 ? colors.warning : colors.destructive} note="Part des scénarios perdants" />
              <KpiCard label="Pire cas à 95%" value={formatMoney(mc.var_95)} color={colors.destructive} note="Perte dans les 5% de cas les plus durs" />
              <KpiCard label="Fourchette (95%)" value={`[${formatMoney(mc.p025)} ; ${formatMoney(mc.p975)}]`} color={colors.info} note="Plage de résultats la plus probable" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <KpiCard label="Profit médian" value={formatMoney(mc.median_profit)} color={mc.median_profit > 0 ? colors.success : colors.destructive} note="La moitié des scénarios est au-dessus de ce montant" />
              <KpiCard label="Écart-type" value={formatMoney(mc.std_profit)} color={colors.info} note="Volatilité des résultats autour de la moyenne" />
              <KpiCard label="IC95 de la moyenne" value={`[${formatMoney(mc.ci_mean_lower)} ; ${formatMoney(mc.ci_mean_upper)}]`} color={colors.info} note="Précision de l'estimation du profit moyen (± 1,96 · σ/√n)" />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Répartition des résultats possibles ({mc.n_sims.toLocaleString("fr-FR")} scénarios)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-2 text-xs text-muted-foreground">
                  Les barres vertes sont des scénarios rentables, les rouges des pertes. Plus la partie rouge est
                  large, plus le vol est risqué.
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={mc.histogram}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <RechartsTooltip />
                    <ReferenceLine x={mc.histogram.find((b) => b.center >= mc.var_95)?.label ?? ""} stroke={colors.destructive} strokeDasharray="4 4" />
                    <Bar dataKey="count" name="Fréquence" opacity={0.7}>
                      {mc.histogram.map((b, i) => (
                        <Cell key={i} fill={b.center >= 0 ? colors.success : colors.destructive} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

// ── Onglet 3 : Optimisation du prix ──────────────────────────────────────

function OptimizeTab({ flights, flightId, onFlightChange }: { flights: Flight[]; flightId: string; onFlightChange: (v: string) => void }) {
  const [tMin, setTMin] = useState("500");
  const [tMax, setTMax] = useState("8000");
  const [tStep, setTStep] = useState("100");
  const [opt, setOpt] = useState<OptimizationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!flightId) return;
    setLoading(true);
    try {
      setOpt(
        await apiPost<OptimizationResult>("/decision/optimize", {
          flight_id: Number(flightId),
          ticket_min: Number(tMin),
          ticket_max: Number(tMax),
          ticket_step: Number(tStep),
        }),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const winner = opt?.winner;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
      {/* Colonne gauche : réglages */}
      <div className="space-y-4">
        <Explainer title="De quoi s'agit-il ?">
          Quel prix de billet (et quel avion) maximisent le profit de ce vol ? L'outil suppose que monter le
          prix fait baisser la demande, teste tous les prix possibles, pour chaque avion de la flotte, et
          retient la meilleure combinaison.
        </Explainer>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Paramètres</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FlightPicker flights={flights} value={flightId} onChange={onFlightChange} />
            <Num label="Prix minimum (MAD)" value={tMin} onChange={setTMin} />
            <Num label="Prix maximum (MAD)" value={tMax} onChange={setTMax} />
            <Num label="Pas (MAD)" value={tStep} onChange={setTStep} hint="Intervalle entre deux prix testés" />
            <Button className="w-full" onClick={run} disabled={loading}>
              {loading ? "Calcul..." : "Trouver le prix optimal"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Colonne droite : résultats */}
      <div className="space-y-4">
        {!winner && (
          <EmptyState
            title="Aucune recommandation"
            description="Sélectionnez un vol, définissez la plage de prix puis cliquez sur « Trouver le prix optimal »."
          />
        )}

        {winner && (
          <>
            <Summary tone={winner.best_profit > 0 ? "good" : "bad"}>
              Recommandation : un {winner.model} à {winner.best_ticket} MAD par billet, pour un profit estimé de{" "}
              {formatMoney(winner.best_profit)} (remplissage {winner.load_pct.toFixed(1)}%).
            </Summary>

            <Card className="border-2 border-success bg-success/5">
              <CardHeader>
                <CardTitle className="text-sm tracking-widest text-success">RECOMMANDATION</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <RecoRow label="Avion conseillé" value={winner.model} />
                <RecoRow label="Prix billet optimal" value={`${winner.best_ticket} MAD`} />
                <RecoRow label="Passagers estimés" value={`${winner.best_pax} pax`} />
                <RecoRow label="Taux de remplissage" value={`${winner.load_pct.toFixed(1)}%`} />
                <RecoRow label="Profit maximal prévu" value={formatMoney(winner.best_profit)} highlight={winner.best_profit > 0 ? "good" : "bad"} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Comparaison — tous les avions</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Avion</TableHead>
                      <TableHead className="text-right">Capacité</TableHead>
                      <TableHead className="text-right">Prix optimal</TableHead>
                      <TableHead className="text-right">Passagers</TableHead>
                      <TableHead className="text-right">Remplissage</TableHead>
                      <TableHead className="text-right">Profit max</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {opt?.results.map((r, i) => (
                      <TableRow key={r.model} className={i === 0 ? "bg-success/5" : undefined}>
                        <TableCell className="font-medium">{r.model}</TableCell>
                        <TableCell className="text-right">{r.capacity} pax</TableCell>
                        <TableCell className="text-right">{r.best_ticket} MAD</TableCell>
                        <TableCell className="text-right">{r.best_pax} pax</TableCell>
                        <TableCell className="text-right">{r.load_pct.toFixed(1)}%</TableCell>
                        <TableCell className="text-right font-semibold" style={{ color: r.best_profit > 0 ? colors.success : colors.destructive }}>
                          {formatMoney(r.best_profit)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Profit maximal par avion</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={opt?.results ?? []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="model" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={80} />
                    <RechartsTooltip />
                    <Bar dataKey="best_profit" name="Profit max">
                      {(opt?.results ?? []).map((r, i) => (
                        <Cell key={i} fill={i === 0 ? colors.primary : r.best_profit > 0 ? colors.success : colors.destructive} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function RecoRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "good" | "bad";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm font-semibold",
          highlight === "good" ? "text-success" : highlight === "bad" ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}
