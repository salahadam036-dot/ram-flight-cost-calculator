import numpy as np
from scipy import stats

from app.database import get_connection


def linear_regression(values: list, horizon: int):
    """Regression lineaire (moindres carres) via scipy.stats.linregress.

    Retourne aussi la p-value de la pente, son erreur type et l'intervalle de
    prediction a 95 % pour chaque vol futur (incertitude sur une nouvelle
    observation, pas seulement sur la moyenne).
    """
    n = len(values)
    if n < 2:
        raise ValueError("Au moins 2 points sont necessaires pour la regression.")

    x = np.arange(n, dtype=float)
    y = np.asarray(values, dtype=float)
    res = stats.linregress(x, y)

    slope = float(res.slope)
    intercept = float(res.intercept)

    y_pred = (intercept + slope * x).tolist()
    x_future = n + np.arange(horizon, dtype=float)
    y_future = (intercept + slope * x_future).tolist()

    # R² = coefficient de determination (carre du coefficient de correlation).
    # Serie constante -> rvalue indefini (0/0) -> R² = 0.
    r2 = float(res.rvalue ** 2)
    if not np.isfinite(r2):
        r2 = 0.0

    # Tests de nullite de la pente (H0 : pente = 0).
    p_value = float(res.pvalue)
    slope_stderr = float(res.stderr)
    if not np.isfinite(p_value):
        p_value = 1.0
    if not np.isfinite(slope_stderr):
        slope_stderr = 0.0

    # Intervalle de prediction a 95 % pour une future observation en x0 :
    #   yhat ± t(n-2, 0.975) * sqrt(MSE * (1 + 1/n + (x0 - xbar)² / Sxx))
    df = n - 2
    x_bar = float(np.mean(x))
    sxx = float(np.sum((x - x_bar) ** 2))
    residuals = y - (intercept + slope * x)
    mse = float(np.sum(residuals ** 2)) / df if df > 0 else 0.0
    t_crit = float(stats.t.ppf(0.975, df)) if df > 0 else float(stats.norm.ppf(0.975))
    se = np.sqrt(mse * (1 + 1 / n + (x_future - x_bar) ** 2 / sxx))
    half = t_crit * se
    center = intercept + slope * x_future
    ci_lower = (center - half).tolist()
    ci_upper = (center + half).tolist()

    if slope > 0.5:
        trend = "hausse"
    elif slope < -0.5:
        trend = "baisse"
    else:
        trend = "stable"

    return (y_pred, y_future, round(r2, 3), trend, slope,
            p_value, slope_stderr, ci_lower, ci_upper)


def get_history(aircraft_id=None) -> list:
    conn = get_connection()
    query = """
        SELECT f.id, f.flight_number, f.passengers, f.duration_hours,
               f.fuel_price_per_liter, f.ticket_price_avg,
               a.capacity, a.fuel_consumption_per_hour, a.model,
               cr.total_cost, cr.total_revenue, cr.profit_margin,
               cr.is_profitable, cr.cost_per_passenger, cr.fixed_costs, cr.variable_costs
        FROM cost_results cr
        JOIN flights f ON f.id = cr.flight_id
        JOIN aircraft a ON a.id = f.aircraft_id
    """
    if aircraft_id:
        query += " WHERE f.aircraft_id = %s ORDER BY f.id"
        rows = conn.execute(query, (aircraft_id,)).fetchall()
    else:
        query += " ORDER BY f.id"
        rows = conn.execute(query).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _insufficient_data_message(aircraft_id, count: int) -> str:
    """Construit un message explicite et actionnable quand un avion n'a pas assez
    d'historique de coûts pour établir une prévision."""
    from app.database import get_connection

    if aircraft_id:
        conn = get_connection()
        try:
            row = conn.execute("SELECT model FROM aircraft WHERE id=%s", (aircraft_id,)).fetchone()
        finally:
            conn.close()
        model = row["model"] if row else "Cet avion"

        # Cas particulier : avion cargo (aucun vol de passagers).
        conn = get_connection()
        try:
            pax_flights = conn.execute(
                "SELECT COUNT(*) FROM flights WHERE aircraft_id=%s AND passengers > 0",
                (aircraft_id,),
            ).fetchone()["count"]
        finally:
            conn.close()

        if pax_flights == 0:
            return (
                f"Impossible de prévoir une tendance pour {model} : c'est un avion cargo "
                "sans vols de passagers, donc sans historique de coûts. Ce type d'appareil "
                "n'est pas pris en charge par la prévision."
            )
        return (
            f"{model} n'a pas encore assez de vols dont le coût a été calculé "
            f"({count} seulement, 2 minimum requis). Calculez d'abord les coûts de ses vols "
            "dans l'onglet Vols puis réessayez."
        )

    return (
        "Il n'y a pas encore assez de vols dont le coût a été calculé pour établir une "
        "prévision (2 minimum requis). Calculez d'abord les coûts de vos vols dans l'onglet Vols."
    )


def run_forecast(aircraft_id=None, horizon=5) -> dict:
    history = get_history(aircraft_id)
    if len(history) < 2:
        raise ValueError(_insufficient_data_message(aircraft_id, len(history)))

    load_factors = [h["passengers"] / h["capacity"] * 100 for h in history]
    fuel_costs = [h["variable_costs"] * 0.6 for h in history]
    revenues = [h["total_revenue"] for h in history]
    profits = [h["total_revenue"] - h["total_cost"] for h in history]

    series_def = [
        ("Taux de Remplissage (%)", load_factors, "#3B82F6", "%"),
        ("Consommation Carburant (MAD)", fuel_costs, "#F59E0B", " MAD"),
        ("Revenu Attendu (MAD)", revenues, "#10B981", " MAD"),
        ("Profit Futur (MAD)", profits, "#C2002F", " MAD"),
    ]

    series_out = []
    for name, values, color, unit in series_def:
        y_pred, y_future, r2, trend, slope, p_value, slope_stderr, ci_lower, ci_upper = (
            linear_regression(values, horizon)
        )
        series_out.append(
            {
                "name": name,
                "unit": unit,
                "color": color,
                "history": [round(v, 2) for v in values],
                "y_pred": [round(v, 2) for v in y_pred],
                "y_future": [round(v, 2) for v in y_future],
                "r2": r2,
                "p_value": p_value,
                "slope_stderr": round(slope_stderr, 4),
                "ci_lower": [round(v, 2) for v in ci_lower],
                "ci_upper": [round(v, 2) for v in ci_upper],
                "trend": trend,
                "slope": round(slope, 4),
            }
        )

    if aircraft_id:
        conn = get_connection()
        row = conn.execute("SELECT model FROM aircraft WHERE id=%s", (aircraft_id,)).fetchone()
        conn.close()
        label = row["model"] if row else "Avion"
    else:
        label = "Tous les avions"

    return {
        "label": label,
        "history_count": len(history),
        "horizon": horizon,
        "series": series_out,
    }
