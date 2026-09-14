import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calculator, ChevronDown, Pencil, Plus, Trash2, TrendingDown, TrendingUp, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { SortableHeader } from "@/components/SortableHeader";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiDelete, apiGet, apiPost, apiPut, importFlightExcel } from "@/lib/api";
import { colors } from "@/lib/colors";
import { useSort } from "@/lib/useSort";
import { formatMoney, formatPct } from "@/lib/utils";
import type { Aircraft, Airport, CostResult, Flight } from "@/types";

type SortKey =
  | "flight_number"
  | "flight_date"
  | "departure_airport"
  | "arrival_airport"
  | "aircraft_model"
  | "passengers"
  | "total_cost"
  | "total_revenue"
  | "profit_margin";

const FLIGHT_COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "flight_number", label: "N° Vol" },
  { key: "flight_date", label: "Date" },
  { key: "departure_airport", label: "Depart" },
  { key: "arrival_airport", label: "Arrivee" },
  { key: "aircraft_model", label: "Avion" },
  { key: "passengers", label: "Passagers", align: "right" },
  { key: "total_cost", label: "Cout Total", align: "right" },
  { key: "total_revenue", label: "Revenu", align: "right" },
  { key: "profit_margin", label: "Marge", align: "right" },
];

interface FormState {
  flight_number: string;
  departure_airport: string;
  arrival_airport: string;
  distance_km: string;
  duration_hours: string;
  aircraft_id: string;
  passengers: string;
  fuel_price_per_liter: string;
  ticket_price_avg: string;
  catering_cost_per_pax: string;
  handling_cost: string;
  taxes_airport: string;
  flight_date: string;
}

const emptyForm: FormState = {
  flight_number: "",
  departure_airport: "",
  arrival_airport: "",
  distance_km: "0",
  duration_hours: "0",
  aircraft_id: "",
  passengers: "150",
  fuel_price_per_liter: "9.5",
  ticket_price_avg: "1200",
  catering_cost_per_pax: "25",
  handling_cost: "500",
  taxes_airport: "0",
  flight_date: "",
};

export default function FlightsPage() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [airports, setAirports] = useState<Airport[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Flight | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [costResult, setCostResult] = useState<{ flight: Flight; result: CostResult } | null>(null);
  const [showMarginCalc, setShowMarginCalc] = useState(false);
  const [loading, setLoading] = useState(true);
  const { sorted: sortedFlights, sortKey, sortDir, toggle } = useSort<Flight, SortKey>(
    flights,
    "flight_number",
    "asc",
  );
  const fileRef = useRef<HTMLInputElement>(null);

  // Compte le nombre d'occurrences de chaque numéro de vol pour afficher la
  // nature "série hebdomadaire" plutôt que de laisser croire à des doublons.
  const flightCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const fl of flights) {
      counts.set(fl.flight_number, (counts.get(fl.flight_number) ?? 0) + 1);
    }
    return counts;
  }, [flights]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, a, ap] = await Promise.all([
        apiGet<Flight[]>("/flights"),
        apiGet<Aircraft[]>("/aircraft"),
        apiGet<Airport[]>("/airports"),
      ]);
      setFlights(f);
      setAircraft(a);
      setAirports(ap);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm, aircraft_id: aircraft[0] ? String(aircraft[0].id) : "" });
    setOpen(true);
  };

  const openEdit = (fl: Flight) => {
    setEditing(fl);
    setForm({
      flight_number: fl.flight_number,
      departure_airport: fl.departure_airport,
      arrival_airport: fl.arrival_airport,
      distance_km: String(fl.distance_km),
      duration_hours: String(fl.duration_hours),
      aircraft_id: String(fl.aircraft_id),
      passengers: String(fl.passengers),
      fuel_price_per_liter: String(fl.fuel_price_per_liter),
      ticket_price_avg: String(fl.ticket_price_avg),
      catering_cost_per_pax: String(fl.catering_cost_per_pax),
      handling_cost: String(fl.handling_cost),
      taxes_airport: String(fl.taxes_airport),
      flight_date: fl.flight_date ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.flight_number.trim()) {
      toast.error("Le numero de vol est obligatoire.");
      return;
    }
    const body = {
      flight_number: form.flight_number.trim(),
      departure_airport: form.departure_airport,
      arrival_airport: form.arrival_airport,
      distance_km: Number(form.distance_km),
      duration_hours: Number(form.duration_hours),
      aircraft_id: Number(form.aircraft_id),
      passengers: Number(form.passengers),
      fuel_price_per_liter: Number(form.fuel_price_per_liter),
      ticket_price_avg: Number(form.ticket_price_avg),
      catering_cost_per_pax: Number(form.catering_cost_per_pax),
      handling_cost: Number(form.handling_cost),
      taxes_airport: Number(form.taxes_airport),
      flight_date: form.flight_date || null,
      status: "planned",
    };
    try {
      if (editing) await apiPut(`/flights/${editing.id}`, body);
      else await apiPost("/flights", body);
      toast.success("Vol enregistre");
      setOpen(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remove = async (fl: Flight) => {
    if (!confirm(`Supprimer le vol ${fl.flight_number} ?`)) return;
    try {
      await apiDelete(`/flights/${fl.id}`);
      toast.success("Vol supprime");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const calculate = async (fl: Flight) => {
    try {
      const result = await apiPost<CostResult>(`/flights/${fl.id}/calculate`);
      setCostResult({ flight: fl, result });
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const importExcel = async (file: File) => {
    try {
      const fl = await importFlightExcel<Flight>(file);
      toast.success(`Vol ${fl.flight_number} importe avec succes`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestion des Vols"
        description="Chaque ligne est un vol (départ). Un même numéro de vol peut apparaître plusieurs fois : il s'agit d'une série hebdomadaire sur la même route."
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importExcel(f);
                e.target.value = "";
              }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Importer Excel
            </Button>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" /> Nouveau Vol
            </Button>
          </>
        }
      />

      {loading ? (
        <LoadingSkeleton cards={8} />
      ) : (
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {FLIGHT_COLUMNS.map((col) => (
                  <SortableHeader
                    key={col.key}
                    label={col.label}
                    align={col.align}
                    active={sortKey === col.key}
                    dir={sortDir}
                    onClick={() => toggle(col.key)}
                  />
                ))}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedFlights.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={FLIGHT_COLUMNS.length + 1} className="p-0">
                    <EmptyState
                      title="Aucun vol"
                      description="Importez un fichier Excel ou créez un nouveau vol pour commencer à analyser la rentabilité."
                    />
                  </TableCell>
                </TableRow>
              ) : (
              sortedFlights.map((fl) => (
                <TableRow key={fl.id}>
                  <TableCell className="font-medium">
                    <div>{fl.flight_number}</div>
                    {(flightCounts.get(fl.flight_number) ?? 0) > 1 && (
                      <div className="text-[11px] font-normal text-muted-foreground">
                        {flightCounts.get(fl.flight_number)} vols
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {fl.flight_date ? new Date(fl.flight_date + "T00:00:00").toLocaleDateString("fr-FR") : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{fl.departure_airport}</div>
                    {fl.departure_airport_name && (
                      <div className="text-xs text-muted-foreground">
                        {fl.departure_airport_name}
                        {fl.departure_airport_city ? ` · ${fl.departure_airport_city}` : ""}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{fl.arrival_airport}</div>
                    {fl.arrival_airport_name && (
                      <div className="text-xs text-muted-foreground">
                        {fl.arrival_airport_name}
                        {fl.arrival_airport_city ? ` · ${fl.arrival_airport_city}` : ""}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{fl.aircraft_model ?? "—"}</TableCell>
                  <TableCell className="text-right">{fl.passengers}</TableCell>
                  <TableCell className="text-right">{fl.total_cost != null ? formatMoney(fl.total_cost) : "—"}</TableCell>
                  <TableCell className="text-right">{fl.total_revenue != null ? formatMoney(fl.total_revenue) : "—"}</TableCell>
                  <TableCell
                    className="text-right font-semibold"
                    style={{
                      color: fl.profit_margin != null
                        ? fl.profit_margin >= 0 ? colors.success : colors.destructive
                        : undefined,
                    }}
                  >
                    {fl.profit_margin != null ? formatPct(fl.profit_margin) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => calculate(fl)} aria-label="Calculer">
                            <Calculator className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Calculer la rentabilite</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(fl)} aria-label="Modifier">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Modifier</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove(fl)} aria-label="Supprimer">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Supprimer</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le vol" : "Nouveau vol"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="N° de vol" value={form.flight_number} onChange={(v) => setForm({ ...form, flight_number: v })} placeholder="ex: AT-500" />

            <div className="grid gap-1.5">
              <Label>Avion</Label>
              <Select value={form.aircraft_id} onValueChange={(v) => setForm({ ...form, aircraft_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {aircraft.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.model} ({a.capacity} pax)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Depart</Label>
              <Select value={form.departure_airport} onValueChange={(v) => setForm({ ...form, departure_airport: v })}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>
                  {airports.map((ap) => (
                    <SelectItem key={ap.code} value={ap.code}>
                      {ap.code} — {ap.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Arrivee</Label>
              <Select value={form.arrival_airport} onValueChange={(v) => setForm({ ...form, arrival_airport: v })}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>
                  {airports.map((ap) => (
                    <SelectItem key={ap.code} value={ap.code}>
                      {ap.code} — {ap.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Field label="Distance (km)" type="number" value={form.distance_km} onChange={(v) => setForm({ ...form, distance_km: v })} />
            <Field label="Duree (heures)" type="number" step="0.25" value={form.duration_hours} onChange={(v) => setForm({ ...form, duration_hours: v })} />
            <Field label="Passagers" type="number" value={form.passengers} onChange={(v) => setForm({ ...form, passengers: v })} />
            <Field label="Prix carburant (MAD/L)" type="number" step="0.01" value={form.fuel_price_per_liter} onChange={(v) => setForm({ ...form, fuel_price_per_liter: v })} />
            <Field label="Prix billet moyen (MAD)" type="number" value={form.ticket_price_avg} onChange={(v) => setForm({ ...form, ticket_price_avg: v })} />
            <Field label="Catering / pax (MAD)" type="number" value={form.catering_cost_per_pax} onChange={(v) => setForm({ ...form, catering_cost_per_pax: v })} />
            <Field label="Handling (MAD)" type="number" value={form.handling_cost} onChange={(v) => setForm({ ...form, handling_cost: v })} />
            <Field label="Taxes aeroportuaires (MAD)" type="number" value={form.taxes_airport} onChange={(v) => setForm({ ...form, taxes_airport: v })} />
            <Field label="Date du vol" type="date" value={form.flight_date} onChange={(v) => setForm({ ...form, flight_date: v })} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={save}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!costResult} onOpenChange={(v) => { if (!v) { setCostResult(null); setShowMarginCalc(false); } }}>
        <DialogContent className="max-w-xl gap-0 p-0 overflow-hidden">
          {costResult && (
            <>
              <div className="border-b border-border bg-muted/40 px-6 py-4 pr-12">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    <span className="truncate">
                      {costResult.flight.flight_number} · {costResult.flight.departure_airport} → {costResult.flight.arrival_airport}
                    </span>
                    <span
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                      style={{
                        color: costResult.result.is_profitable ? colors.success : colors.destructive,
                        background: costResult.result.is_profitable
                          ? "hsl(var(--success) / 0.15)"
                          : "hsl(var(--destructive) / 0.15)",
                      }}
                    >
                      {costResult.result.is_profitable
                        ? <TrendingUp className="h-3.5 w-3.5" />
                        : <TrendingDown className="h-3.5 w-3.5" />}
                      {costResult.result.is_profitable ? "Rentable" : "Déficitaire"}
                    </span>
                  </DialogTitle>
                  <div className="text-sm text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => setShowMarginCalc((s) => !s)}
                      className="inline-flex items-center gap-1.5 rounded-md transition-colors hover:text-foreground"
                    >
                      <span>
                        Marge{" "}
                        <span className="font-semibold" style={{ color: costResult.result.is_profitable ? colors.success : colors.destructive }}>
                          {costResult.result.profit_margin.toFixed(1)}%
                        </span>
                      </span>
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMarginCalc ? "rotate-180" : ""}`} />
                    </button>
                  </div>

                  {showMarginCalc && (
                    <div className="mt-2 rounded-lg border border-border bg-background p-3 text-sm">
                      <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                        Comment la marge est calculée
                      </div>
                      <div className="flex items-center justify-between py-0.5">
                        <span className="text-muted-foreground">Revenu total</span>
                        <span>{formatMoney(costResult.result.total_revenue)}</span>
                      </div>
                      <div className="flex items-center justify-between py-0.5">
                        <span className="text-muted-foreground">Coût total</span>
                        <span>{formatMoney(costResult.result.total_cost)}</span>
                      </div>
                      <div className="my-1 flex items-center justify-between border-t border-border pt-1 font-semibold">
                        <span>Profit (= Revenu − Coût)</span>
                        <span style={{ color: costResult.result.is_profitable ? colors.success : colors.destructive }}>
                          {formatMoney(costResult.result.total_revenue - costResult.result.total_cost)}
                        </span>
                      </div>
                      <div className="mt-1 rounded bg-muted/50 px-2 py-1.5 text-center font-mono text-xs text-muted-foreground">
                        Marge % = Profit ÷ Coût × 100 =
                        {" "}{formatMoney(costResult.result.total_revenue - costResult.result.total_cost)} ÷{" "}
                        {formatMoney(costResult.result.total_cost)} × 100 ={" "}
                        <span className="font-semibold" style={{ color: costResult.result.is_profitable ? colors.success : colors.destructive }}>
                          {costResult.result.profit_margin.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  )}
                </DialogHeader>
              </div>

              <div className="px-6 pt-5">
                <Tabs defaultValue="total" className="space-y-4">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="total">Coût Total</TabsTrigger>
                    <TabsTrigger value="revenu">Revenu</TabsTrigger>
                    <TabsTrigger value="cpp">Coût / Pax</TabsTrigger>
                    <TabsTrigger value="seuil">Seuil</TabsTrigger>
                  </TabsList>

                  <div className="h-[360px] overflow-y-auto pr-1">
                    <TabsContent value="total" className="mt-0 space-y-3">
                      <div
                        className="flex items-baseline justify-between rounded-lg border border-border bg-muted/20 px-4 py-3"
                      >
                        <span className="text-sm text-muted-foreground">Coût total du vol</span>
                        <span className="text-2xl font-semibold" style={{ color: colors.primary }}>
                          {formatMoney(costResult.result.total_cost)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-lg border border-border p-3">
                          <div className="text-xs text-muted-foreground">Coûts fixes</div>
                          <div className="text-lg font-semibold">{formatMoney(costResult.result.fixed_costs)}</div>
                        </div>
                        <div className="rounded-lg border border-border p-3">
                          <div className="text-xs text-muted-foreground">Coûts variables</div>
                          <div className="text-lg font-semibold">{formatMoney(costResult.result.variable_costs)}</div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border p-4">
                        <div className="mb-2 text-sm font-semibold">Détail des coûts</div>
                        <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Coûts Fixes</div>
                        <Row label="Amortissement" value={costResult.result.detail?.amortization} />
                        <Row label="Équipage" value={costResult.result.detail?.crew} />
                        <Row label="Assurance" value={costResult.result.detail?.insurance} />
                        <div className="my-1 flex justify-between border-t border-border pt-1 text-sm font-semibold">
                          <span>Sous-total fixes</span>
                          <span>{formatMoney(costResult.result.fixed_costs)}</span>
                        </div>

                        <div className="mb-1 mt-3 text-xs font-semibold uppercase text-muted-foreground">Coûts Variables</div>
                        <Row label={`Carburant (${Math.round(costResult.result.detail?.fuel_liters ?? 0)} L)`} value={costResult.result.detail?.fuel_cost} />
                        <Row label="Maintenance" value={costResult.result.detail?.maintenance} />
                        <Row label="Catering" value={costResult.result.detail?.catering} />
                        <Row label="Handling" value={costResult.result.detail?.handling} />
                        <Row label="Taxes" value={costResult.result.detail?.taxes} />
                        <div className="my-1 flex justify-between border-t border-border pt-1 text-sm font-semibold">
                          <span>Sous-total variables</span>
                          <span>{formatMoney(costResult.result.variable_costs)}</span>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="revenu" className="mt-0 space-y-3">
                      <div
                        className="flex items-baseline justify-between rounded-lg border border-border bg-muted/20 px-4 py-3"
                      >
                        <span className="text-sm text-muted-foreground">Revenu total du vol</span>
                        <span className="text-2xl font-semibold" style={{ color: colors.success }}>
                          {formatMoney(costResult.result.total_revenue)}
                        </span>
                      </div>

                      <div className="rounded-lg border border-border p-4">
                        <Row label={`${costResult.flight.passengers} passagers × ${costResult.flight.ticket_price_avg} MAD`} value={costResult.flight.passengers * costResult.flight.ticket_price_avg} />
                        <div className="my-1 flex justify-between border-t border-border pt-1 text-sm font-semibold">
                          <span>Revenu total</span>
                          <span>{formatMoney(costResult.result.total_revenue)}</span>
                        </div>
                      </div>

                      <div
                        className="flex items-baseline justify-between rounded-lg border border-border p-4"
                      >
                        <span className="text-sm text-muted-foreground">Profit net</span>
                        <span
                          className="text-xl font-semibold"
                          style={{ color: costResult.result.is_profitable ? colors.success : colors.destructive }}
                        >
                          {formatMoney(costResult.result.total_revenue - costResult.result.total_cost)}
                        </span>
                      </div>
                    </TabsContent>

                    <TabsContent value="cpp" className="mt-0 space-y-3">
                      <div
                        className="flex items-baseline justify-between rounded-lg border border-border bg-muted/20 px-4 py-3"
                      >
                        <span className="text-sm text-muted-foreground">Coût par passager</span>
                        <span className="text-2xl font-semibold" style={{ color: colors.warning }}>
                          {formatMoney(costResult.result.cost_per_passenger)}
                        </span>
                      </div>

                      <div className="rounded-lg border border-border p-4">
                        <Row label="Coût par passager" value={costResult.result.cost_per_passenger} />
                        <Row label="Prix billet moyen" value={costResult.flight.ticket_price_avg} />
                        <div className="my-1 flex justify-between border-t border-border pt-1 text-sm font-semibold">
                          <span>Marge par passager</span>
                          <span
                            style={{ color: costResult.flight.ticket_price_avg - costResult.result.cost_per_passenger >= 0 ? colors.success : colors.destructive }}
                          >
                            {formatMoney(costResult.flight.ticket_price_avg - costResult.result.cost_per_passenger)}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border p-3 text-center">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Passagers à bord</div>
                        <div className="text-lg font-semibold">{costResult.flight.passengers} pax</div>
                      </div>
                    </TabsContent>

                    <TabsContent value="seuil" className="mt-0 space-y-3">
                      <div
                        className="flex items-baseline justify-between rounded-lg border border-border bg-muted/20 px-4 py-3"
                      >
                        <span className="text-sm text-muted-foreground">Seuil de rentabilité</span>
                        <span className="text-2xl font-semibold" style={{ color: colors.info }}>
                          {costResult.result.break_even_passengers} pax
                        </span>
                      </div>

                      <div className="rounded-lg border border-border p-4">
                        <Row label="Passagers réels" value={costResult.flight.passengers} />
                        <Row label="Seuil de rentabilité" value={costResult.result.break_even_passengers} />
                        <div className="my-1 flex justify-between border-t border-border pt-1 text-sm font-semibold">
                          <span>Marge de sécurité</span>
                          <span style={{ color: costResult.flight.passengers - costResult.result.break_even_passengers >= 0 ? colors.success : colors.destructive }}>
                            {costResult.flight.passengers - costResult.result.break_even_passengers} pax
                          </span>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                        Au-delà de <span className="font-medium text-foreground">{costResult.result.break_even_passengers} passagers</span>, le vol devient rentable.
                        {costResult.flight.passengers > costResult.result.break_even_passengers
                          ? " Ce vol est au-dessus du seuil."
                          : " Ce vol est en dessous du seuil."}
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>
              </div>

              <div className="border-t border-border px-6 py-4">
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCostResult(null)}>Fermer</Button>
                </DialogFooter>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  step?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Input type={type} step={step} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function Row({ label, value }: { label: string; value?: number }) {
  return (
    <div className="flex justify-between py-0.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{formatMoney(value ?? 0)}</span>
    </div>
  );
}
