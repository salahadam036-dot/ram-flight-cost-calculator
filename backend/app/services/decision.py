import numpy as np
from scipy import stats

from app.database import get_connection
from app.services.cost import get_cost_result, get_flight_and_aircraft


def compute_kpis(flight_id: int) -> dict:
    flight, aircraft = get_flight_and_aircraft(flight_id)
    if flight is None:
        raise ValueError(f"Vol ID={flight_id} introuvable.")
    if aircraft is None:
        raise ValueError(f"Avion ID={flight['aircraft_id']} introuvable.")
    cr = get_cost_result(flight_id)
    if cr is None:
        raise ValueError("Calculez d'abord le cout de ce vol dans 'Gestion des Vols'.")

    distance = flight["distance_km"]
    pax = flight["passengers"]
    capacity = aircraft["capacity"]

    ask = capacity * distance
    rpk = pax * distance
    load_factor = pax / capacity * 100 if capacity > 0 else 0
    rask = cr["total_revenue"] / ask if ask > 0 else 0
    cask = cr["total_cost"] / ask if ask > 0 else 0
    yield_val = cr["total_revenue"] / rpk if rpk > 0 else 0
    belf = cask / rask * 100 if rask > 0 else 0
    marge = rask - cask

    return {
        "flight_id": flight_id,
        "flight_number": flight["flight_number"],
        "route": f"{flight['departure_airport']} -> {flight['arrival_airport']}",
        "distance_km": distance,
        "passengers": pax,
        "capacity": capacity,
        "ask": round(ask, 2),
        "rpk": round(rpk, 2),
        "load_factor": round(load_factor, 1),
        "rask": round(rask, 4),
        "cask": round(cask, 4),
        "yield_val": round(yield_val, 4),
        "belf": round(belf, 1),
        "marge_rask_cask": round(marge, 4),
        "total_revenue": cr["total_revenue"],
        "total_cost": cr["total_cost"],
        "profit_margin": cr["profit_margin"],
    }


def _build_histogram(profits, bins: int = 40) -> list:
    """Histogramme 40 classes construit avec numpy (equivalents des anciens bins manuels)."""
    arr = np.asarray(profits, dtype=float)
    mn = float(arr.min())
    mx = float(arr.max())
    if mx == mn:
        mx = mn + 1
    width = (mx - mn) / bins
    idx = np.floor((arr - mn) / width).astype(int)
    np.clip(idx, 0, bins - 1, out=idx)
    counts = np.bincount(idx, minlength=bins)
    return [
        {"label": str(int(mn + i * width)), "count": int(c),
         "center": round(mn + (i + 0.5) * width, 0)}
        for i, c in enumerate(counts)
    ]


def monte_carlo(flight_id: int, n_sims=5000, fuel_std_pct=10.0,
                pax_std_pct=10.0, ticket_std_pct=10.0) -> dict:
    flight, aircraft = get_flight_and_aircraft(flight_id)
    if flight is None:
        raise ValueError(f"Vol ID={flight_id} introuvable.")
    if aircraft is None:
        raise ValueError(f"Avion ID={flight['aircraft_id']} introuvable.")
    if get_cost_result(flight_id) is None:
        raise ValueError("Calculez d'abord le cout de ce vol dans 'Gestion des Vols'.")

    n = max(1, int(n_sims))
    fuel_std = fuel_std_pct / 100
    pax_std = pax_std_pct / 100
    ticket_std = ticket_std_pct / 100

    # Generateur de nombres pseudo-aleatoires standard (PCG64), seed fixe -> reproductible.
    rng = np.random.default_rng(42)

    # Chocs multiplicatifs ~ N(1, sigma), bornes a 10 % de la valeur de base.
    fuel_factor = np.maximum(0.1, rng.normal(1.0, fuel_std, n))
    pax_factor = np.maximum(0.1, rng.normal(1.0, pax_std, n))
    ticket_factor = np.maximum(0.1, rng.normal(1.0, ticket_std, n))

    fuel_price = flight["fuel_price_per_liter"] * fuel_factor
    pax_raw = np.floor(flight["passengers"] * pax_factor).astype(int)
    pax = np.clip(pax_raw, 1, aircraft["capacity"])
    ticket = flight["ticket_price_avg"] * ticket_factor

    fuel_liters = aircraft["fuel_consumption_per_hour"] * flight["duration_hours"]
    fuel_cost = fuel_liters * fuel_price
    variable = (fuel_cost + aircraft["maintenance_cost_per_flight"]
                + flight["catering_cost_per_pax"] * pax
                + flight["handling_cost"] + flight["taxes_airport"])
    fixed = (aircraft["amortization_cost_per_flight"]
             + aircraft["crew_cost_per_flight"]
             + aircraft["insurance_cost_per_flight"])
    total_cost = fixed + variable
    revenue = ticket * pax
    profits = revenue - total_cost

    mean_profit = float(np.mean(profits))
    median_profit = float(np.median(profits))
    std_profit = float(np.std(profits, ddof=1)) if n > 1 else 0.0
    prob_loss = float(np.mean(profits < 0) * 100)
    var_95 = float(np.percentile(profits, 5))
    p025 = float(np.percentile(profits, 2.5))
    p975 = float(np.percentile(profits, 97.5))

    # IC a 95 % de la MOYENNE estimee (erreur-type = sigma / racine(n)).
    z = float(stats.norm.ppf(0.975))
    mean_se = std_profit / np.sqrt(n) if n > 1 else 0.0
    ci_mean_lower = mean_profit - z * mean_se
    ci_mean_upper = mean_profit + z * mean_se

    if prob_loss < 10:
        verdict = "Vol tres sur — Risque de perte tres faible"
        color = "#00D4A0"
    elif prob_loss < 25:
        verdict = "Vol acceptable — Risque modere"
        color = "#D4A843"
    elif prob_loss < 50:
        verdict = "Vol risque — Probabilite de perte elevee"
        color = "#C8102E"
    else:
        verdict = "Vol tres risque — Majoritairement deficitaire"
        color = "#C8102E"

    return {
        "flight_id": flight_id,
        "n_sims": n,
        "mean_profit": round(mean_profit, 2),
        "median_profit": round(median_profit, 2),
        "std_profit": round(std_profit, 2),
        "ci_mean_lower": round(ci_mean_lower, 2),
        "ci_mean_upper": round(ci_mean_upper, 2),
        "prob_loss": round(prob_loss, 1),
        "var_95": round(var_95, 2),
        "p025": round(p025, 2),
        "p975": round(p975, 2),
        "verdict": verdict,
        "verdict_color": color,
        "histogram": _build_histogram(profits),
    }


def optimize(flight_id: int, ticket_min=500, ticket_max=5000, ticket_step=100) -> dict:
    flight, base_aircraft = get_flight_and_aircraft(flight_id)
    if flight is None:
        raise ValueError(f"Vol ID={flight_id} introuvable.")
    if base_aircraft is None:
        raise ValueError(f"Avion ID={flight['aircraft_id']} introuvable.")
    if ticket_min >= ticket_max:
        raise ValueError("Le prix minimum doit etre inferieur au maximum.")
    if get_cost_result(flight_id) is None:
        raise ValueError("Calculez d'abord le cout de ce vol dans 'Gestion des Vols'.")
    if base_aircraft["capacity"] <= 0:
        raise ValueError("L'optimisation du prix ne s'applique pas aux avions cargo (sans passagers).")

    conn = get_connection()
    rows = conn.execute("SELECT * FROM aircraft ORDER BY model").fetchall()
    conn.close()

    # Evaluation vectorisee (numpy) : grille de prix (P) x flotte (A).
    prices = np.arange(ticket_min, ticket_max + ticket_step, ticket_step, dtype=float)
    capacities = np.asarray([r["capacity"] for r in rows], dtype=float)
    fuel_cons = np.asarray([r["fuel_consumption_per_hour"] for r in rows], dtype=float)
    maint = np.asarray([r["maintenance_cost_per_flight"] for r in rows], dtype=float)
    amort = np.asarray([r["amortization_cost_per_flight"] for r in rows], dtype=float)
    crew = np.asarray([r["crew_cost_per_flight"] for r in rows], dtype=float)
    insur = np.asarray([r["insurance_cost_per_flight"] for r in rows], dtype=float)

    base_price = flight["ticket_price_avg"] if flight["ticket_price_avg"] > 0 else 1
    base_load = flight["passengers"] / base_aircraft["capacity"]
    elasticity = -0.5
    price_ratio = prices / base_price

    # Demande a elasticite constante, bornee comme avant (10 % - 100 %).
    load = np.clip(base_load * price_ratio ** elasticity, 0.1, 1.0)
    pax = np.floor(capacities[:, None] * load[None, :]).astype(int)
    pax = np.clip(pax, 1, capacities[:, None].astype(int))

    fuel_liters = fuel_cons * flight["duration_hours"]
    fuel_cost = fuel_liters[:, None] * flight["fuel_price_per_liter"]
    variable = (fuel_cost + maint[:, None]
                + flight["catering_cost_per_pax"] * pax
                + flight["handling_cost"] + flight["taxes_airport"])
    fixed = amort + crew + insur
    total = fixed[:, None] + variable
    revenue = prices[None, :] * pax
    profit = revenue - total

    best_idx = np.argmax(profit, axis=1)
    n_ac = len(rows)
    rows_idx = np.arange(n_ac)
    best_profit = profit[rows_idx, best_idx]
    best_ticket = prices[best_idx]
    best_pax = pax[rows_idx, best_idx]

    results = []
    for i, row in enumerate(rows):
        capacity = row["capacity"]
        load_pct = best_pax[i] / capacity * 100 if capacity > 0 else 0
        results.append(
            {
                "model": row["model"],
                "capacity": capacity,
                "best_profit": round(float(best_profit[i]), 2),
                "best_ticket": int(best_ticket[i]),
                "best_pax": int(best_pax[i]),
                "load_pct": round(float(load_pct), 1),
            }
        )

    # Tri stable decroissant (meme ordre que l'ancien sorted(list, reverse=True)).
    results.sort(key=lambda x: x["best_profit"], reverse=True)
    winner = results[0] if results else None
    return {"flight_id": flight_id, "results": results, "winner": winner}
