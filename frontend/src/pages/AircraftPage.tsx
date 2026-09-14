import { useCallback, useEffect, useState } from "react";
import { Layers, Pencil, Plane, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { SortableHeader } from "@/components/SortableHeader";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { StatCard } from "@/components/StatCard";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { colors } from "@/lib/colors";
import { useSort } from "@/lib/useSort";
import { formatNumber } from "@/lib/utils";
import type { Aircraft } from "@/types";

const TYPES = ["Narrow-body", "Wide-body", "Regional", "Cargo"];

type AircraftSortKey =
  | "type"
  | "model"
  | "capacity"
  | "fuel_consumption_per_hour"
  | "maintenance_cost_per_flight"
  | "amortization_cost_per_flight"
  | "crew_cost_per_flight";

const AIRCRAFT_COLUMNS: { key: AircraftSortKey; label: string; align?: "right" }[] = [
  { key: "type", label: "Type" },
  { key: "model", label: "Modele" },
  { key: "capacity", label: "Capacite", align: "right" },
  { key: "fuel_consumption_per_hour", label: "Carburant L/h", align: "right" },
  { key: "maintenance_cost_per_flight", label: "Maintenance", align: "right" },
  { key: "amortization_cost_per_flight", label: "Amortissement", align: "right" },
  { key: "crew_cost_per_flight", label: "Equipage", align: "right" },
];

interface FormState {
  type: string;
  model: string;
  capacity: string;
  fuel_consumption_per_hour: string;
  maintenance_cost_per_flight: string;
  amortization_cost_per_flight: string;
  crew_cost_per_flight: string;
  insurance_cost_per_flight: string;
}

const emptyForm: FormState = {
  type: "Narrow-body",
  model: "",
  capacity: "180",
  fuel_consumption_per_hour: "2600",
  maintenance_cost_per_flight: "3500",
  amortization_cost_per_flight: "4200",
  crew_cost_per_flight: "8000",
  insurance_cost_per_flight: "1200",
};

export default function AircraftPage() {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Aircraft | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const { sorted: sortedAircraft, sortKey, sortDir, toggle } = useSort<Aircraft, AircraftSortKey>(
    aircraft,
    "model",
    "asc",
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAircraft(await apiGet<Aircraft[]>("/aircraft"));
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
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (ac: Aircraft) => {
    setEditing(ac);
    setForm({
      type: ac.type,
      model: ac.model,
      capacity: String(ac.capacity),
      fuel_consumption_per_hour: String(ac.fuel_consumption_per_hour),
      maintenance_cost_per_flight: String(ac.maintenance_cost_per_flight),
      amortization_cost_per_flight: String(ac.amortization_cost_per_flight),
      crew_cost_per_flight: String(ac.crew_cost_per_flight),
      insurance_cost_per_flight: String(ac.insurance_cost_per_flight),
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.model.trim()) {
      toast.error("Le modele est obligatoire.");
      return;
    }
    const body = {
      type: form.type,
      model: form.model.trim(),
      capacity: Number(form.capacity),
      fuel_consumption_per_hour: Number(form.fuel_consumption_per_hour),
      maintenance_cost_per_flight: Number(form.maintenance_cost_per_flight),
      amortization_cost_per_flight: Number(form.amortization_cost_per_flight),
      crew_cost_per_flight: Number(form.crew_cost_per_flight),
      insurance_cost_per_flight: Number(form.insurance_cost_per_flight),
    };
    try {
      if (editing) await apiPut(`/aircraft/${editing.id}`, body);
      else await apiPost("/aircraft", body);
      toast.success("Avion enregistre");
      setOpen(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remove = async (ac: Aircraft) => {
    if (!confirm(`Supprimer '${ac.model}' ?`)) return;
    try {
      await apiDelete(`/aircraft/${ac.id}`);
      toast.success("Avion supprime");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const maxCap = aircraft.reduce((m, a) => Math.max(m, a.capacity), 0);
  const typeCount = new Set(aircraft.map((a) => a.type)).size;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestion de la Flotte"
        description="Ajoutez, modifiez ou supprimez les avions et leurs coûts opérationnels (carburant, maintenance, amortissement, équipage, assurance)."
        actions={
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> Ajouter un avion
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Appareils" value={String(aircraft.length)} icon={Plane} color={colors.primary} />
        <StatCard label="Capacite max" value={String(maxCap)} icon={Layers} color={colors.warning} />
        <StatCard label="Types" value={String(typeCount)} icon={Layers} color={colors.info} />
      </div>

      {loading ? (
        <LoadingSkeleton cards={6} />
      ) : (
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {AIRCRAFT_COLUMNS.map((col) => (
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
              {sortedAircraft.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={AIRCRAFT_COLUMNS.length + 1} className="p-0">
                    <EmptyState
                      title="Aucun avion"
                      description="Ajoutez un avion pour alimenter le calcul des coûts de la flotte."
                    />
                  </TableCell>
                </TableRow>
              ) : (
              sortedAircraft.map((ac) => (
                <TableRow key={ac.id}>
                  <TableCell>{ac.type}</TableCell>
                  <TableCell className="font-medium">{ac.model}</TableCell>
                  <TableCell className="text-right">{ac.capacity}</TableCell>
                  <TableCell className="text-right">{formatNumber(ac.fuel_consumption_per_hour)}</TableCell>
                  <TableCell className="text-right">{formatNumber(ac.maintenance_cost_per_flight)}</TableCell>
                  <TableCell className="text-right">{formatNumber(ac.amortization_cost_per_flight)}</TableCell>
                  <TableCell className="text-right">{formatNumber(ac.crew_cost_per_flight)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(ac)} aria-label="Modifier">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Modifier</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove(ac)} aria-label="Supprimer">
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier l'avion" : "Ajouter un avion"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field label="Modele" value={form.model} onChange={(v) => setForm({ ...form, model: v })} placeholder="ex: Boeing 737-800" />
            <Field label="Capacite" type="number" value={form.capacity} onChange={(v) => setForm({ ...form, capacity: v })} />
            <Field label="Carburant (L/h)" type="number" value={form.fuel_consumption_per_hour} onChange={(v) => setForm({ ...form, fuel_consumption_per_hour: v })} />
            <Field label="Maintenance (MAD)" type="number" value={form.maintenance_cost_per_flight} onChange={(v) => setForm({ ...form, maintenance_cost_per_flight: v })} />
            <Field label="Amortissement (MAD)" type="number" value={form.amortization_cost_per_flight} onChange={(v) => setForm({ ...form, amortization_cost_per_flight: v })} />
            <Field label="Equipage (MAD)" type="number" value={form.crew_cost_per_flight} onChange={(v) => setForm({ ...form, crew_cost_per_flight: v })} />
            <Field label="Assurance (MAD)" type="number" value={form.insurance_cost_per_flight} onChange={(v) => setForm({ ...form, insurance_cost_per_flight: v })} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={save}>Enregistrer</Button>
          </DialogFooter>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
