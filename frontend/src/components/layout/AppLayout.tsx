import type { ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  BrainCircuit,
  ChevronDown,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  MapPin,
  Plane,
  PlaneTakeoff,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import ChatbotWidget from "@/components/chatbot/ChatbotWidget";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV = [
  { key: "dashboard", label: "Tableau de Bord", description: "Vue d'ensemble des performances financieres", icon: LayoutDashboard },
  { key: "flights", label: "Vols", description: "Gestion et rentabilite des vols", icon: Plane },
  { key: "aircraft", label: "Flotte", description: "Caracteristiques et couts operationnels", icon: PlaneTakeoff },
  { key: "airports", label: "Aeroports", description: "Catalogue des codes IATA et redevances", icon: MapPin },
  { key: "simulation", label: "Scenarios", description: "Scenarios economiques sur un vol", icon: FlaskConical },
  { key: "forecast", label: "Prevision", description: "Projections par regression lineaire", icon: TrendingUp },
  { key: "decision", label: "Risque & Rendement", description: "Monte Carlo, KPI et optimisation du prix", icon: BrainCircuit },
  { key: "users", label: "Utilisateurs", description: "Gestion des comptes et des roles", icon: Users, adminOnly: true },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const current = NAV.find((n) => location.pathname.startsWith(`/${n.key}`));

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="flex h-full overflow-hidden">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            RAM
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Royal Air Maroc</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Flight Operations
            </div>
          </div>
        </div>

        <div className="px-3 py-1">
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Menu
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-1">
          {NAV.filter((i) => !i.adminOnly || user?.role === "admin").map((item) => {
            const Icon = item.icon;
            const active = location.pathname.startsWith(`/${item.key}`);
            return (
              <NavLink
                key={item.key}
                to={`/${item.key}`}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 px-1 py-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
              {(user?.username ?? "U")[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium capitalize">{user?.username}</div>
              <div className="truncate text-[11px] uppercase text-muted-foreground">{user?.role}</div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Deconnexion">
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Deconnexion</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-6">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-tight">
              {current?.label ?? "Tableau de Bord"}
            </h1>
            <p className="truncate text-xs text-muted-foreground">{current?.description}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {(user?.username ?? "U")[0].toUpperCase()}
                  </div>
                  <span className="hidden max-w-[120px] truncate capitalize sm:inline">
                    {user?.username}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <div className="capitalize">{user?.username}</div>
                  <div className="text-xs font-normal uppercase text-muted-foreground">
                    {user?.role}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="h-4 w-4" /> Deconnexion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1760px] p-6">{children}</div>
        </main>
      </div>

      <ChatbotWidget />
    </div>
  );
}
