import { useCallback, useEffect, useState } from "react";
import { MapPin, Pencil, Plane, Plus, Trash2 } from "lucide-react";
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
import { formatMoney } from "@/lib/utils";
import type { Airport } from "@/types";

type AirportSortKey = "code" | "name" | "city" | "country" | "landing_fee";

const AIRPORT_COLUMNS: { key: AirportSortKey; label: string; align?: "right" }[] = [
  { key: "code", label: "Code IATA" },
  { key: "name", label: "Nom" },
  { key: "city", label: "Ville" },
  { key: "country", label: "Pays" },
  { key: "landing_fee", label: "Redevance", align: "right" },
];

interface FormState {
  code: string;
  name: string;
  city: string;
  country: string;
  landing_fee: string;
}

const emptyForm: FormState = { code: "", name: "", city: "", country: "", landing_fee: "0" };

export default function AirportsPage() {
  const [airports, setAirports] = useState<Airport[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Airport | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const { sorted: sortedAirports, sortKey, sortDir, toggle } = useSort<Airport, AirportSortKey>(
    airports,
    "code",
    "asc",
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAirports(await apiGet<Airport[]>("/airports"));
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

  const openEdit = (ap: Airport) => {
    setEditing(ap);
    setForm({
      code: ap.code,
      name: ap.name,
      city: ap.city,
      country: ap.country,
      landing_fee: String(ap.landing_fee),
    });
    setOpen(true);
  };

  const save = async () => {
    const code = form.code.trim().toUpperCase();
    if (!code) return toast.error("Le code IATA est obligatoire.");
    if (code.length !== 3 || !/^[A-Z]{3}$/.test(code)) {
      return toast.error("Le code IATA doit comporter 3 lettres (ex: CMN).");
    }
    if (!form.name.trim()) return toast.error("Le nom de l'aeroport est obligatoire.");

    try {
      if (editing) {
        await apiPut(`/airports/${editing.code}`, {
          name: form.name.trim(),
          city: form.city.trim(),
          country: form.country.trim(),
          landing_fee: Number(form.landing_fee),
        });
      } else {
        await apiPost("/airports", {
          code,
          name: form.name.trim(),
          city: form.city.trim(),
          country: form.country.trim(),
          landing_fee: Number(form.landing_fee),
        });
      }
      toast.success("Aeroport enregistre");
      setOpen(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remove = async (ap: Airport) => {
    if (!confirm(`Supprimer l'aeroport '${ap.code} — ${ap.name}' ?`)) return;
    try {
      await apiDelete(`/airports/${ap.code}`);
      toast.success("Aeroport supprime");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const totalFee = airports.reduce((s, a) => s + (a.landing_fee || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestion des Aeroports"
        description="Gerez le catalogue des aeroports (codes IATA) et leurs redevances, utilises pour creer les vols."
        actions={
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> Ajouter un aeroport
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Aeroports" value={String(airports.length)} icon={Plane} color={colors.primary} />
        <StatCard
          label="Pays"
          value={String(new Set(airports.map((a) => a.country)).size)}
          icon={MapPin}
          color={colors.info}
        />
        <StatCard label="Redevance totale" value={formatMoney(totalFee)} color={colors.warning} />
      </div>

      {loading ? (
        <LoadingSkeleton cards={6} />
      ) : (
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {AIRPORT_COLUMNS.map((col) => (
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
              {sortedAirports.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={AIRPORT_COLUMNS.length + 1} className="p-0">
                    <EmptyState
                      title="Aucun aeroport"
                      description="Ajoutez un aeroport (code IATA) pour pouvoir creer des vols."
                    />
                  </TableCell>
                </TableRow>
              ) : (
              sortedAirports.map((ap) => (
                <TableRow key={ap.code}>
                  <TableCell className="font-medium">{ap.code}</TableCell>
                  <TableCell>{ap.name}</TableCell>
                  <TableCell>{ap.city}</TableCell>
                  <TableCell>{ap.country}</TableCell>
                  <TableCell className="text-right">{formatMoney(ap.landing_fee)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(ap)} aria-label="Modifier">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Modifier</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => remove(ap)}
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
            <DialogTitle>{editing ? "Modifier l'aeroport" : "Nouvel aeroport"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Code IATA</Label>
              <Input
                value={form.code}
                maxLength={3}
                disabled={!!editing}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="CMN"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Nom</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mohammed V" />
            </div>
            <div className="grid gap-1.5">
              <Label>Ville</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Casablanca" />
            </div>
            <div className="grid gap-1.5">
              <Label>Pays</Label>
              <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="Maroc" />
            </div>
            <div className="grid gap-1.5">
              <Label>Redevance d'atterrissage (MAD)</Label>
              <Input type="number" value={form.landing_fee} onChange={(e) => setForm({ ...form, landing_fee: e.target.value })} />
            </div>
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
