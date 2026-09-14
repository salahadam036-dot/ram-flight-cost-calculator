import { useCallback, useEffect, useState } from "react";
import { Download, Gauge, Percent, Plane, RefreshCw, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { RankingFlight } from "@/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiGet, downloadDashboardPdf } from "@/lib/api";
import { colors } from "@/lib/colors";
import { formatMoney, formatPct } from "@/lib/utils";
import type { DashboardStats } from "@/types";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await apiGet<DashboardStats>("/dashboard/stats"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const exportPdf = async () => {
    try {
      await downloadDashboardPdf();
      toast.success("Rapport PDF telecharge");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (loading && !stats) {
    return <LoadingSkeleton cards={6} />;
  }

  if (!stats) return null;

  const pieData = [
    { name: "Couts Fixes", value: stats.avg_fixed_costs },
    { name: "Couts Variables", value: stats.avg_variable_costs },
  ];

  return (
    <div className="space-y-6">
      {stats.total_flights === 0 ? (
        <EmptyState
          title="Aucun vol analyse"
          description="Calculez les couts d'au moins un vol pour voir les statistiques et les graphiques de performance apparaître ici."
        />
      ) : (
        <>
          <InsightBanner
            totalProfit={stats.total_profit}
            profitabilityRate={stats.profitability_rate}
            deficitCount={stats.deficit_count}
            profitableFlights={stats.profitable_flights}
          />

      <PageHeader
        title="Tableau de Bord"
        description="Vue d'ensemble de la rentabilite de la flotte : consultez les indicateurs, les graphiques et les classements, puis exportez le rapport en PDF."
        actions={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={load} aria-label="Actualiser">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Actualiser</TooltipContent>
            </Tooltip>
            <Button onClick={exportPdf}>
              <Download className="h-4 w-4" /> Exporter PDF
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Vols Analyses" value={String(stats.total_flights)} icon={Plane} color={colors.info} hint="Vols avec un coût calculé" />
        <StatCard label="Vols Rentables" value={String(stats.profitable_flights)} icon={TrendingUp} color={colors.success} hint="Revenu ≥ coût total" />
        <StatCard label="Vols Deficitaires" value={String(stats.deficit_count)} icon={TrendingDown} color={colors.destructive} hint="Revenu < coût total" />
        <StatCard label="Marge Moyenne" value={formatPct(stats.avg_margin)} icon={Percent} color={stats.avg_margin > 0 ? colors.success : colors.destructive} hint="(Revenu − coût) / coût" />
        <StatCard label="Profit Net Total" value={formatMoney(stats.total_profit)} icon={Wallet} color={stats.total_profit >= 0 ? colors.success : colors.destructive} hint="Somme des profits de tous les vols" />
        <StatCard label="Taux Rentabilite" value={`${stats.profitability_rate}%`} icon={Gauge} color={colors.primary} hint="Part de vols rentables" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Repartition Moyenne des Couts</CardTitle>
            <p className="text-sm text-muted-foreground">Part moyenne des couts fixes vs variables par vol</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}>
                  <Cell fill={colors.primary} />
                  <Cell fill={colors.warning} />
                </Pie>
                <RechartsTooltip formatter={(v) => formatMoney(Number(v))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Marge Moyenne par Type d'Avion</CardTitle>
            <p className="text-sm text-muted-foreground">Rentabilite moyenne de chaque modele, basee sur ses vols analyses</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.by_aircraft}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="model" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <RechartsTooltip formatter={(v) => formatPct(Number(v))} />
                <Bar dataKey="avg_margin" name="Marge %" radius={[6, 6, 0, 0]}>
                  {stats.by_aircraft.map((d, i) => (
                    <Cell key={i} fill={d.avg_margin >= 0 ? colors.success : colors.destructive} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RankingCard title="Vols les Plus Rentables" data={stats.top_flights} tone="success" />
        <RankingCard title="Vols Deficitaires" data={stats.deficit_flights} tone="destructive" />
      </div>
        </>
      )}
    </div>
  );
}

function InsightBanner({
  totalProfit,
  profitabilityRate,
  deficitCount,
  profitableFlights,
}: {
  totalProfit: number;
  profitabilityRate: number;
  deficitCount: number;
  profitableFlights: number;
}) {
  let message: string;
  let color: string;
  let bg: string;

  if (totalProfit > 0 && profitabilityRate >= 70) {
    message = "Flotte en bonne sante : la majorite des vols est rentable et le profit net est positif.";
    color = colors.success;
    bg = "rgba(16, 185, 129, 0.08)";
  } else if (profitabilityRate >= 70) {
    message = "La flotte est majoritairement rentable ; surveillez les vols deficitaires restants.";
    color = colors.info;
    bg = "rgba(59, 130, 246, 0.08)";
  } else if (totalProfit > 0) {
    message = "Profit net positif, mais plusieurs vols sont deficitaires : ciblez les moins performants pour ameliorer la marge.";
    color = colors.warning;
    bg = "rgba(245, 158, 11, 0.08)";
  } else if (deficitCount > 0) {
    message = `Attention : ${deficitCount}, ${deficitCount === 1 ? "vol deficitaire" : "vols deficitaires"} et un profit net negatif. La flotte necessite une optimisation.`;
    color = colors.destructive;
    bg = "rgba(239, 68, 68, 0.08)";
  } else {
    message = "Aucun vol rentable pour le moment.";
    color = colors.muted;
    bg = "rgba(148, 163, 184, 0.08)";
  }

  return (
    <div
      className="flex items-start gap-3 rounded-lg border px-4 py-3 text-sm"
      style={{ backgroundColor: bg, borderColor: color, color }}
    >
      <div
        className="mt-1 h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <p className="font-medium">{message}</p>
      {profitableFlights > 0 && (
        <span className="ml-auto shrink-0 font-semibold">{profitableFlights} vols rentables</span>
      )}
    </div>
  );
}

function RankingCard({
  title,
  data,
  tone,
}: {
  title: string;
  data: RankingFlight[];
  tone: "success" | "destructive";
}) {
  const color = tone === "success" ? colors.success : colors.destructive;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vol</TableHead>
              <TableHead>Depart</TableHead>
              <TableHead>Arrivee</TableHead>
              <TableHead className="text-right">Marge</TableHead>
              <TableHead className="text-right">Profit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Aucune donnee
                </TableCell>
              </TableRow>
            ) : (
              data.map((f) => (
                <TableRow key={f.flight_number}>
                  <TableCell className="font-medium">{f.flight_number}</TableCell>
                  <TableCell>{f.departure_airport}</TableCell>
                  <TableCell>{f.arrival_airport}</TableCell>
                  <TableCell className="text-right font-semibold" style={{ color }}>
                    {formatPct(f.profit_margin)}
                  </TableCell>
                  <TableCell
                    className="text-right font-semibold"
                    style={{ color: f.profit >= 0 ? color : colors.destructive }}
                  >
                    {formatMoney(f.profit)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
