import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Shield, Trash2, User, Users } from "lucide-react";
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
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/colors";
import { useSort } from "@/lib/useSort";
import type { User as UserType } from "@/types";

interface FormState {
  username: string;
  role: string;
  password: string;
  confirm: string;
}

type UserSortKey = "id" | "username" | "role" | "created_at";

const USER_COLUMNS: { key: UserSortKey; label: string; align?: "right" }[] = [
  { key: "id", label: "ID" },
  { key: "username", label: "Nom d'utilisateur" },
  { key: "role", label: "Role" },
  { key: "created_at", label: "Date de creation" },
];

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserType[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserType | null>(null);
  const [form, setForm] = useState<FormState>({ username: "", role: "analyst", password: "", confirm: "" });
  const [loading, setLoading] = useState(true);
  const { sorted: sortedUsers, sortKey, sortDir, toggle } = useSort<UserType, UserSortKey>(
    users,
    "id",
    "asc",
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await apiGet<UserType[]>("/users"));
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
    setForm({ username: "", role: "analyst", password: "", confirm: "" });
    setOpen(true);
  };

  const openEdit = (u: UserType) => {
    setEditing(u);
    setForm({ username: u.username, role: u.role, password: "", confirm: "" });
    setOpen(true);
  };

  const save = async () => {
    const username = form.username.trim();
    if (!username) return toast.error("L'identifiant est obligatoire.");
    if (username.length < 3) return toast.error("L'identifiant doit contenir au moins 3 caracteres.");
    if (!editing && !form.password) return toast.error("Le mot de passe est obligatoire pour un nouvel utilisateur.");
    if (form.password && form.password.length < 6) return toast.error("Le mot de passe doit contenir au moins 6 caracteres.");
    if (form.password && form.password !== form.confirm) return toast.error("Les mots de passe ne correspondent pas.");

    try {
      if (editing) {
        await apiPut(`/users/${editing.id}`, { username, role: form.role, password: form.password || undefined });
      } else {
        await apiPost("/users", { username, role: form.role, password: form.password });
      }
      toast.success("Utilisateur enregistre");
      setOpen(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remove = async (u: UserType) => {
    if (!confirm(`Supprimer l'utilisateur '${u.username}' ?`)) return;
    try {
      await apiDelete(`/users/${u.id}`);
      toast.success("Utilisateur supprime");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const admins = users.filter((u) => u.role === "admin").length;
  const analysts = users.filter((u) => u.role === "analyst").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestion des Utilisateurs"
        description="Creez, modifiez ou supprimez les comptes et attribuez les roles (admin ou analyst)."
        actions={
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> Ajouter un utilisateur
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Utilisateurs" value={String(users.length)} icon={Users} color={colors.primary} />
        <StatCard label="Admins" value={String(admins)} icon={Shield} color={colors.warning} />
        <StatCard label="Analystes" value={String(analysts)} icon={User} color={colors.info} />
      </div>

      {loading ? (
        <LoadingSkeleton cards={4} />
      ) : (
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {USER_COLUMNS.map((col) => (
                  <SortableHeader
                    key={col.key}
                    label={col.label}
                    active={sortKey === col.key}
                    dir={sortDir}
                    onClick={() => toggle(col.key)}
                  />
                ))}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={USER_COLUMNS.length + 1} className="p-0">
                    <EmptyState
                      title="Aucun utilisateur"
                      description="Ajoutez un utilisateur pour donner accès à l'application."
                    />
                  </TableCell>
                </TableRow>
              ) : (
              sortedUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="text-muted-foreground">{u.id}</TableCell>
                  <TableCell className="font-medium">{u.username}</TableCell>
                  <TableCell>
                    <span className={u.role === "admin" ? "font-medium text-warning" : "font-medium text-info"}>
                      {u.role.toUpperCase()}
                    </span>
                  </TableCell>
                  <TableCell>{u.created_at ? u.created_at.slice(0, 10) : "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(u)} aria-label="Modifier">
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
                            disabled={u.id === currentUser?.id}
                            onClick={() => remove(u)}
                            aria-label="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {u.id === currentUser?.id ? "Impossible de supprimer son compte" : "Supprimer"}
                        </TooltipContent>
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
            <DialogTitle>{editing ? "Modifier l'utilisateur" : "Nouvel utilisateur"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Identifiant</Label>
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="ex: jean.dupont" />
            </div>
            <div className="grid gap-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="analyst">Analyste</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Mot de passe {editing && "(laisser vide pour ne pas changer)"}</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Confirmation</Label>
              <Input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
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
