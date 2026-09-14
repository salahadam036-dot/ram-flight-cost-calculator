import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Beaker,
  Flame,
  Fuel,
  Landmark,
  Play,
  RotateCcw,
  Swords,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { SortableHeader } from "@/components/SortableHeader";
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
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { colors } from "@/lib/colors";
import { cn, formatMoney, formatPct } from "@/lib/utils";
import { useSort } from "@/lib/useSort";
import type { CostResult, Flight, SimulationHistory, SimulationPreset, SimulationResult } from "@/types";

const PRESET_ICONS: Record<string, typeof Fuel> = {
  fuel: Fuel,
  flame: Flame,
  "trending-up": TrendingUp,
  "trending-down": TrendingDown,
  swords: Swords,
  landmark: Landmark,
  "alert-triangle": AlertTriangle,
};

export default function SimulationPage() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [presets, setPresets] = useState<SimulationPreset[]>([]);
  const [flightId, setFlightId] = useState<string>("");
  const [activePresetKey, setActivePresetKey] = useState<string | null>(null);
  const [fuelVal, setFuelVal] = useState(0);
  const [loadVal, setLoadVal] = useState(0);
  const [ticketVal, setTicketVal] = useState(0);
  const [taxVal, setTaxVal] = useState("0");
  const [base, setBase] = useState<CostResult | null>(null);
  const [currentFlight, setCurrentFlight] = useState<Flight | null>(null);
  const [sim, setSim] = useState<SimulationResult | null>(null);
  const [history, setHistory] = useState<SimulationHistory[]>([]);
  const [running, setRunning] = useState(false);
  const [search, setSearch] = useState("");
  const [selectorSort, setSelectorSort] = useState<"margin-desc" | "margin-asc" | "number">("margin-desc");
  const { sorted: sortedHistory, sortKey, sortDir, toggle } = useSort<SimulationHistory, keyof SimulationHistory>(
    history,
    "created_at",
    "desc",
  );

  const loadFlights = useCallback(async () => {
    try {
      const [f, p] = await Promise.all([
        apiGet<Flight[]>("/flights"),
        apiGet<SimulationPreset[]>("/simulation/presets"),
      ]);
      setFlights(f);
      setPresets(p);
      if (f.length && !flightId) {
        // Auto-sélectionne le vol de passagers le plus rentable pour démarrer la
        // démo sur une base positive (le plus parlant pour un premier essai).
        const best = [...f]
          .filter((x) => x.passengers > 0)
          .sort((a, b) => (b.profit_margin ?? -Infinity) - (a.profit_margin ?? -Infinity))[0];
        const firstId = String(best.id);
        setFlightId(firstId);
        setCurrentFlight(best);
        try {
          setBase(await apiGet<CostResult>(`/flights/${firstId}/cost`));
        } catch {
          setBase(null);
        }
        loadHistory(firstId);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadFlights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sélecteur de vol amélioré : on regroupe les vols par numéro (une carte par
  // route) et on expose la marge de base, le remplissage et l'avion, pour un
  // choix éclairé sans avoir à ouvrir la page Vols.
  const pickerFlights = useMemo(() => {
    const byNumber = new Map<string, Flight>();
    for (const f of flights) {
      // Exclut les vols cargo (0 passager) : l'analyse de rentabilité passagers
      // ne s'applique pas au fret.
      if (f.passengers <= 0) continue;
      // Garde le vol le plus récent (id le plus élevé) de chaque numéro.
      const existing = byNumber.get(f.flight_number);
      if (!existing || f.id > existing.id) byNumber.set(f.flight_number, f);
    }
    let list = Array.from(byNumber.values());

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((f) =>
        [
          f.flight_number,
          f.departure_airport,
          f.arrival_airport,
          f.departure_airport_name,
          f.arrival_airport_name,
          f.aircraft_model,
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }

    list.sort((a, b) => {
      if (selectorSort === "number") return a.flight_number.localeCompare(b.flight_number);
      const am = a.profit_margin ?? -Infinity;
      const bm = b.profit_margin ?? -Infinity;
      return selectorSort === "margin-desc" ? bm - am : am - bm;
    });
    return list;
  }, [flights, search, selectorSort]);

  const loadHistory = async (id: string) => {
    try {
      setHistory(await apiGet<SimulationHistory[]>(`/simulation/${id}/history`));
    } catch {
      setHistory([]);
    }
  };

  const onFlightSelect = async (id: string) => {
    setFlightId(id);
    setSim(null);
    setCurrentFlight(flights.find((x) => String(x.id) === id) ?? null);
    if (!id) return;
    try {
      let cost: CostResult;
      try {
        cost = await apiGet<CostResult>(`/flights/${id}/cost`);
      } catch {
        cost = await apiPost<CostResult>(`/flights/${id}/calculate`);
      }
      setBase(cost);
    } catch {
      setBase(null);
    }
    await loadHistory(id);
  };

  // Construit automatiquement le nom du scénario à partir des leviers, pour
  // que l'historique soit toujours lisible sans saisie manuelle.
  const buildScenarioName = () => {
    const parts: string[] = [];
    if (fuelVal !== 0) parts.push(`Carb ${fuelVal > 0 ? "+" : ""}${fuelVal}%`);
    if (loadVal !== 0) parts.push(`Rempl ${loadVal > 0 ? "+" : ""}${loadVal}%`);
    if (ticketVal !== 0) parts.push(`Billet ${ticketVal > 0 ? "+" : ""}${ticketVal}%`);
    if (Number(taxVal) !== 0) parts.push(`Taxe +${taxVal}`);
    return parts.length ? parts.join(" · ") : "Scénario de base";
  };

  const run = async () => {
    if (!flightId) return;
    setRunning(true);
    try {
      // Si un preset actif correspond exactement aux leviers, on réutilise son nom
      // ; sinon on génère un nom descriptif depuis les valeurs des curseurs.
      const activePreset = activePresetKey ? presets.find((p) => p.key === activePresetKey) : null;
      const name = activePreset
        ? activePreset.name
        : buildScenarioName();
      const res = await apiPost<SimulationResult>("/simulation/simulate", {
        flight_id: Number(flightId),
        fuel_variation_pct: fuelVal,
        load_factor_variation_pct: loadVal,
        ticket_price_variation_pct: ticketVal,
        extra_tax: Number(taxVal),
        scenario_name: name,
      });
      setSim(res);
      await loadHistory(flightId);
      toast.success("Simulation enregistrée");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const applyPreset = (p: SimulationPreset) => {
    setActivePresetKey(p.key);
    setFuelVal(p.fuel_variation_pct);
    setLoadVal(p.load_factor_variation_pct);
    setTicketVal(p.ticket_price_variation_pct);
    setTaxVal(String(p.extra_tax));
    toast.info(`Scénario « ${p.name} » appliqué — lancez la simulation`);
  };

  const reset = () => {
    setFuelVal(0);
    setLoadVal(0);
    setTicketVal(0);
    setTaxVal("0");
    setActivePresetKey(null);
    setSim(null);
  };

  const removeHistory = async (h: SimulationHistory) => {
    try {
      await apiDelete(`/simulation/history/${h.id}`);
      toast.success("Simulation supprimée");
      loadHistory(flightId);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const reapplyHistory = (h: SimulationHistory) => {
    setFuelVal(h.fuel_price_variation);
    setLoadVal(h.load_factor_variation);
    setTicketVal(h.ticket_price_variation);
    setTaxVal(String(h.extra_tax));
    setActivePresetKey(null);
    // Reconstruit le résultat complet pour réafficher le panneau de résultat
    // sans relancer la simulation (les champs sont désormais persistés).
    if (h.simulated_total_cost != null && h.simulated_revenue != null) {
      setSim({
        scenario_name: h.scenario_name,
        new_fuel_price: 0,
        new_passengers: h.new_passengers ?? 0,
        new_ticket_price: h.new_ticket_price ?? 0,
        load_factor: 0,
        fixed_costs: h.fixed_costs ?? 0,
        variable_costs: h.variable_costs ?? 0,
        total_cost: h.simulated_total_cost,
        total_revenue: h.simulated_revenue,
        profit_margin: h.simulated_margin,
        profit_amount: h.simulated_profit ?? h.simulated_revenue - h.simulated_total_cost,
        break_even_passengers: h.break_even_passengers ?? 0,
        is_profitable: h.is_profitable ?? h.simulated_revenue >= h.simulated_total_cost,
      });
    } else {
      setSim(null);
    }
    toast.info(`Scénario « ${h.scenario_name} » rechargé`);
  };

  const comparison = [
    { key: "total_cost", label: "Coût total", base: base?.total_cost, sim: sim?.total_cost, money: true },
    { key: "total_revenue", label: "Revenu", base: base?.total_revenue, sim: sim?.total_revenue, money: true },
    { key: "profit_margin", label: "Marge %", base: base?.profit_margin, sim: sim?.profit_margin, pct: true },
    { key: "passengers", label: "Passagers", base: currentFlight?.passengers ?? 0, sim: sim?.new_passengers, int: true },
    { key: "ticket", label: "Prix billet", base: currentFlight?.ticket_price_avg ?? 0, sim: sim?.new_ticket_price, money: true },
  ];

  const barData = [
    { name: "Coût", Base: base?.total_cost ?? 0, Simulé: sim?.total_cost ?? 0 },
    { name: "Revenu", Base: base?.total_revenue ?? 0, Simulé: sim?.total_revenue ?? 0 },
    { name: "Profit", Base: (base?.total_revenue ?? 0) - (base?.total_cost ?? 0), Simulé: sim?.profit_amount ?? 0 },
  ];

  const marginHistory = useMemo(
    () =>
      [...history]
        .slice(0, 12)
        .reverse()
        .map((h, i) => ({
          i,
          name: h.scenario_name,
          margin: h.simulated_margin,
        })),
    [history],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laboratoire de Simulation"
        description="Appliquez des chocs économiques à un vol et comparez l'impact sur sa rentabilité en temps réel."
        actions={
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Beaker className="h-3.5 w-3.5" /> Outil exploratoire — les résultats ne modifient pas le vol réel
          </span>
        }
      />

      {/* Sélecteur de vol enrichi */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Liste des vols (recherche + tri + cartes) */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Choisir le vol à simuler</CardTitle>
            <div className="flex gap-2 pt-1">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher (n° vol, route, avion)..."
                className="h-8 text-sm"
              />
              <Select value={selectorSort} onValueChange={(v) => setSelectorSort(v as typeof selectorSort)}>
                <SelectTrigger className="h-8 w-[190px] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="margin-desc">Marge : plus rentable</SelectItem>
                  <SelectItem value="margin-asc">Marge : plus déficitaire</SelectItem>
                  <SelectItem value="number">Numéro de vol</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="max-h-[360px] overflow-y-auto">
            {pickerFlights.length === 0 ? (
              <EmptyState title="Aucun vol" description="Aucun vol ne correspond à votre recherche." />
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {pickerFlights.map((f) => {
                  const selected = String(f.id) === flightId;
                  const margin = f.profit_margin;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => onFlightSelect(String(f.id))}
                      className={cn(
                        "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
                        selected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border bg-card hover:border-primary/40 hover:bg-accent",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{f.flight_number}</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{
                            color: margin != null ? (margin >= 0 ? colors.success : colors.destructive) : colors.muted,
                            background: margin != null ? (margin >= 0 ? "hsl(var(--success)/0.15)" : "hsl(var(--destructive)/0.15)") : "hsl(var(--muted)/0.15)",
                          }}
                        >
                          {margin != null ? formatPct(margin) : "—"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {f.departure_airport} → {f.arrival_airport} · {f.aircraft_model ?? "Avion ?"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {f.passengers} pax · billet {formatMoney(f.ticket_price_avg)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contexte du vol sélectionné */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Contexte du vol sélectionné</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentFlight ? (
              <>
                <div>
                  <div className="text-lg font-semibold">{currentFlight.flight_number}</div>
                  <div className="text-sm text-muted-foreground">
                    {currentFlight.departure_airport} → {currentFlight.arrival_airport}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {currentFlight.departure_airport_name} → {currentFlight.arrival_airport_name}
                  </div>
                </div>
                <dl className="space-y-2 text-sm">
                  <Row label="Avion" value={currentFlight.aircraft_model ?? "—"} />
                  <Row label="Passagers" value={String(currentFlight.passengers)} />
                  <Row label="Prix billet" value={formatMoney(currentFlight.ticket_price_avg)} />
                  <Row label="Carburant" value={`${currentFlight.fuel_price_per_liter} MAD/L`} />
                  <Row
                    label="Marge de base"
                    value={formatPct(base?.profit_margin)}
                    color={base ? (base.profit_margin >= 0 ? "text-success" : "text-destructive") : undefined}
                  />
                </dl>
              </>
            ) : (
              <EmptyState title="Aucun vol sélectionné" description="Choisissez un vol dans la liste à gauche." />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Scénarios prédéfinis */}
      <div>
        <div className="mb-2 text-sm font-medium">Scénarios de démonstration (cliquez pour appliquer)</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {presets.map((p) => {
            const Icon = PRESET_ICONS[p.icon] ?? Beaker;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p)}
                className="group flex flex-col items-start gap-1.5 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-[11px] leading-snug text-muted-foreground">{p.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Levier de simulation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leviers de simulation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Lever label="Prix du carburant" value={fuelVal} min={-50} max={100} unit="%" onChange={(v) => { setFuelVal(v); setActivePresetKey(null); }} />
            <Lever label="Taux de remplissage" value={loadVal} min={-50} max={50} unit="%" onChange={(v) => { setLoadVal(v); setActivePresetKey(null); }} />
            <Lever label="Prix du billet" value={ticketVal} min={-50} max={100} unit="%" onChange={(v) => { setTicketVal(v); setActivePresetKey(null); }} />
            <div className="space-y-2">
              <Label>Taxe additionnelle (MAD)</Label>
              <Input type="number" value={taxVal} onChange={(e) => { setTaxVal(e.target.value); setActivePresetKey(null); }} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={run} disabled={running}>
                <Play className="h-4 w-4" /> {running ? "Calcul..." : "Lancer la simulation"}
              </Button>
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="h-4 w-4" /> Réinitialiser
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Résultat comparatif */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Résultat du scénario</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!base ? (
              <EmptyState
                title="Vol non calculé"
                description="Choisissez un vol dont le coût a déjà été calculé (ou laissez la page le calculer automatiquement)."
              />
            ) : (
              <>
                {sim && (
                  <div
                    className={cn(
                      "rounded-lg px-4 py-3 text-center text-sm font-semibold",
                      sim.is_profitable
                        ? "bg-success/10 text-success"
                        : "bg-destructive/10 text-destructive",
                    )}
                  >
                    <div className="text-base">
                      {sim.is_profitable ? "Rentable" : "Déficitaire"} — marge {formatPct(sim.profit_margin)}
                    </div>
                    <div className="mt-0.5 text-xs font-normal opacity-80">
                      Profit simulé {formatMoney(sim.profit_amount)} · Seuil de rentabilité : {sim.break_even_passengers} passagers
                    </div>
                  </div>
                )}

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Indicateur</TableHead>
                      <TableHead className="text-right">Base</TableHead>
                      <TableHead className="text-right">Simulé</TableHead>
                      <TableHead className="text-right">Δ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparison.map((row) => {
                      const baseVal = row.base ?? 0;
                      const simVal = row.sim;
                      const delta = simVal != null ? simVal - baseVal : 0;
                      const pct = baseVal !== 0 ? (delta / baseVal) * 100 : 0;
                      const isCost = row.key === "total_cost";
                      const color =
                        Math.abs(delta) < 0.01
                          ? colors.muted
                          : isCost
                            ? delta > 0 ? colors.destructive : colors.success
                            : delta > 0 ? colors.success : colors.destructive;
                      const fmt = (v: number) =>
                        row.money ? formatMoney(v) : row.pct ? formatPct(v) : String(Math.round(v));
                      return (
                        <TableRow key={row.key}>
                          <TableCell className="text-muted-foreground">{row.label}</TableCell>
                          <TableCell className="text-right">{fmt(baseVal)}</TableCell>
                          <TableCell className="text-right">{simVal != null ? fmt(simVal) : "—"}</TableCell>
                          <TableCell className="text-right font-semibold" style={{ color }}>
                            {simVal != null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {sim && (
                  <div>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">Base vs simulé (MAD)</div>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={barData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={60} />
                        <RechartsTooltip formatter={(v) => formatMoney(Number(v))} />
                        <Legend />
                        <Bar dataKey="Base" fill={colors.muted} radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Simulé" fill={colors.primary} radius={[4, 4, 0, 0]}>
                          {barData.map((_, i) => (
                            <Cell
                              key={i}
                              fill={i === 2 && (sim.profit_amount ?? 0) < 0 ? colors.destructive : colors.primary}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Historique des simulations */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Historique des simulations ({history.length})</CardTitle>
          {marginHistory.length >= 2 && (
            <div className="h-16 w-1/2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={marginHistory}>
                  <Line type="monotone" dataKey="margin" name="Marge %" stroke={colors.primary} strokeWidth={2} dot={{ r: 3 }} />
                  <RechartsTooltip formatter={(v) => formatPct(Number(v))} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <EmptyState
              title="Aucune simulation"
              description="Lancez un scénario ci-dessus pour enregistrer une simulation et la comparer ici."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader label="Scénario" active={sortKey === "scenario_name"} dir={sortDir} onClick={() => toggle("scenario_name")} />
                  <SortableHeader label="Δ Carburant" align="right" active={sortKey === "fuel_price_variation"} dir={sortDir} onClick={() => toggle("fuel_price_variation")} />
                  <SortableHeader label="Δ Remplissage" align="right" active={sortKey === "load_factor_variation"} dir={sortDir} onClick={() => toggle("load_factor_variation")} />
                  <SortableHeader label="Δ Billet" align="right" active={sortKey === "ticket_price_variation"} dir={sortDir} onClick={() => toggle("ticket_price_variation")} />
                  <SortableHeader label="Marge" align="right" active={sortKey === "simulated_margin"} dir={sortDir} onClick={() => toggle("simulated_margin")} />
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedHistory.map((h) => (
                  <TableRow
                    key={h.id}
                    className="cursor-pointer transition-colors hover:bg-accent"
                    onClick={() => reapplyHistory(h)}
                    title="Cliquez pour recharger ce scénario"
                  >
                    <TableCell className="font-medium">{h.scenario_name}</TableCell>
                    <TableCell className="text-right">{fmtPctDelta(h.fuel_price_variation)}</TableCell>
                    <TableCell className="text-right">{fmtPctDelta(h.load_factor_variation)}</TableCell>
                    <TableCell className="text-right">{fmtPctDelta(h.ticket_price_variation)}</TableCell>
                    <TableCell className={cn("text-right font-semibold", h.simulated_margin >= 0 ? "text-success" : "text-destructive")}>
                      {formatPct(h.simulated_margin)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => { e.stopPropagation(); reapplyHistory(h); }}
                              aria-label="Recharger"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Recharger ce scénario</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={(e) => { e.stopPropagation(); removeHistory(h); }}
                              aria-label="Supprimer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Supprimer</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Lever({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-semibold text-primary">
          {value >= 0 ? "+" : ""}
          {value}
          {unit}
        </span>
      </div>
      <Slider min={min} max={max} step={1} value={[value]} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}

function fmtPctDelta(v: number) {
  return `${v >= 0 ? "+" : ""}${v}%`;
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium", color)}>{value}</span>
    </div>
  );
}
