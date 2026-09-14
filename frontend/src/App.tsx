import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import { TitleBar } from "./components/layout/TitleBar";
import { useAuth } from "./lib/auth";
import LoginPage from "./pages/LoginPage";

// Code-splitting : chaque page est chargee a la demande pour eviter un bundle
// unique trop volumineux (recharts et les grosses pages ne sont charges que
// lorsqu'on y navigue).
const AircraftPage = lazy(() => import("./pages/AircraftPage"));
const AirportsPage = lazy(() => import("./pages/AirportsPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const DecisionPage = lazy(() => import("./pages/DecisionPage"));
const FlightsPage = lazy(() => import("./pages/FlightsPage"));
const ForecastPage = lazy(() => import("./pages/ForecastPage"));
const SimulationPage = lazy(() => import("./pages/SimulationPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));

function SuspenseSpinner() {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center py-16 text-sm text-muted-foreground">
      Chargement...
    </div>
  );
}

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<SuspenseSpinner />}>{children}</Suspense>;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  // Tant que la session n'a pas ete restauree (localStorage), on n'affiche rien
  // et surtout on ne redirige PAS vers /login : sinon chaque rafraichissement de
  // page provoquerait une deconnexion artificielle.
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TitleBar />
      <div className="min-h-0 flex-1">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout>
              <Outlet />
            </AppLayout>
          </RequireAuth>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<LazyPage><DashboardPage /></LazyPage>} />
        <Route path="/flights" element={<LazyPage><FlightsPage /></LazyPage>} />
        <Route path="/aircraft" element={<LazyPage><AircraftPage /></LazyPage>} />
        <Route path="/airports" element={<LazyPage><AirportsPage /></LazyPage>} />
        <Route path="/simulation" element={<LazyPage><SimulationPage /></LazyPage>} />
        <Route path="/forecast" element={<LazyPage><ForecastPage /></LazyPage>} />
        <Route path="/decision" element={<LazyPage><DecisionPage /></LazyPage>} />
        <Route path="/users" element={<LazyPage><UsersPage /></LazyPage>} />
      </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
