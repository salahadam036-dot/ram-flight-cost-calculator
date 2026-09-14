from app.database import get_connection


def compute_cost(flight: dict, aircraft: dict) -> dict:
    """Calcule les couts fixes, variables et la rentabilite d'un vol."""
    amort = aircraft["amortization_cost_per_flight"]
    crew = aircraft["crew_cost_per_flight"]
    insur = aircraft["insurance_cost_per_flight"]
    fixed = amort + crew + insur

    fuel_liters = aircraft["fuel_consumption_per_hour"] * flight["duration_hours"]
    fuel_cost = fuel_liters * flight["fuel_price_per_liter"]
    maint = aircraft["maintenance_cost_per_flight"]
    catering = flight["catering_cost_per_pax"] * flight["passengers"]
    handling = flight["handling_cost"]
    taxes = flight["taxes_airport"]
    variable = fuel_cost + maint + catering + handling + taxes

    total = fixed + variable
    revenue = flight["ticket_price_avg"] * flight["passengers"]
    cpp = total / max(flight["passengers"], 1)
    vpp = variable / max(flight["passengers"], 1)
    cm = flight["ticket_price_avg"] - vpp
    be = int(fixed / cm) + 1 if cm > 0 else aircraft["capacity"]
    margin = (revenue - total) / total * 100 if total > 0 else 0
    profitable = revenue >= total

    return {
        "fixed_costs": round(fixed, 2),
        "variable_costs": round(variable, 2),
        "total_cost": round(total, 2),
        "total_revenue": round(revenue, 2),
        "cost_per_passenger": round(cpp, 2),
        "break_even_passengers": be,
        "profit_margin": round(margin, 2),
        "is_profitable": profitable,
        "detail": {
            "amortization": round(amort, 2),
            "crew": round(crew, 2),
            "insurance": round(insur, 2),
            "fuel_liters": round(fuel_liters, 1),
            "fuel_cost": round(fuel_cost, 2),
            "maintenance": round(maint, 2),
            "catering": round(catering, 2),
            "handling": round(handling, 2),
            "taxes": round(taxes, 2),
        },
    }


def save_cost_result(flight_id: int, cost: dict) -> None:
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO cost_results (flight_id, fixed_costs, variable_costs, "
            "total_cost, total_revenue, cost_per_passenger, break_even_passengers, "
            "profit_margin, is_profitable) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) "
            "ON CONFLICT (flight_id) DO UPDATE SET "
            "fixed_costs=EXCLUDED.fixed_costs, variable_costs=EXCLUDED.variable_costs, "
            "total_cost=EXCLUDED.total_cost, total_revenue=EXCLUDED.total_revenue, "
            "cost_per_passenger=EXCLUDED.cost_per_passenger, "
            "break_even_passengers=EXCLUDED.break_even_passengers, "
            "profit_margin=EXCLUDED.profit_margin, is_profitable=EXCLUDED.is_profitable",
            (
                flight_id,
                cost["fixed_costs"],
                cost["variable_costs"],
                cost["total_cost"],
                cost["total_revenue"],
                cost["cost_per_passenger"],
                cost["break_even_passengers"],
                cost["profit_margin"],
                1 if cost["is_profitable"] else 0,
            ),
        )
        conn.commit()
    finally:
        conn.close()


def get_flight_and_aircraft(flight_id: int):
    conn = get_connection()
    try:
        flight = conn.execute("SELECT * FROM flights WHERE id=%s", (flight_id,)).fetchone()
        if flight is None:
            return None, None
        aircraft = conn.execute(
            "SELECT * FROM aircraft WHERE id=%s", (flight["aircraft_id"],)
        ).fetchone()
        return flight, aircraft
    finally:
        conn.close()


def calculate_for_flight(flight_id: int) -> dict:
    flight, aircraft = get_flight_and_aircraft(flight_id)
    if flight is None:
        raise ValueError(f"Vol ID={flight_id} introuvable.")
    if aircraft is None:
        raise ValueError(f"Avion ID={flight['aircraft_id']} introuvable.")
    cost = compute_cost(flight, aircraft)
    save_cost_result(flight_id, cost)
    return {"flight_id": flight_id, **cost}


def get_cost_result(flight_id: int) -> dict | None:
    flight, aircraft = get_flight_and_aircraft(flight_id)
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM cost_results WHERE flight_id=%s", (flight_id,)).fetchone()
        if row is None:
            return None
        result = {
            "flight_id": row["flight_id"],
            "fixed_costs": row["fixed_costs"],
            "variable_costs": row["variable_costs"],
            "total_cost": row["total_cost"],
            "total_revenue": row["total_revenue"],
            "cost_per_passenger": row["cost_per_passenger"],
            "break_even_passengers": row["break_even_passengers"],
            "profit_margin": row["profit_margin"],
            "is_profitable": bool(row["is_profitable"]),
        }
    finally:
        conn.close()
    if flight is not None and aircraft is not None:
        result["detail"] = compute_cost(flight, aircraft)["detail"]
    else:
        result["detail"] = None
    return result


def simulate(flight: dict, aircraft: dict, fuel_variation_pct=0.0,
             load_factor_variation_pct=0.0, ticket_price_variation_pct=0.0,
             extra_tax=0.0, scenario_name="Simulation") -> dict:
    nfp = flight["fuel_price_per_liter"] * (1 + fuel_variation_pct / 100)
    base_load = flight["passengers"] / aircraft["capacity"]
    nl = max(0.01, min(1.0, base_load + load_factor_variation_pct / 100))
    np_ = max(1, int(aircraft["capacity"] * nl))
    ntp = flight["ticket_price_avg"] * (1 + ticket_price_variation_pct / 100)

    fuel_liters = aircraft["fuel_consumption_per_hour"] * flight["duration_hours"]
    fuel_cost = fuel_liters * nfp
    maint = aircraft["maintenance_cost_per_flight"]
    catering = flight["catering_cost_per_pax"] * np_
    handling = flight["handling_cost"]
    taxes = flight["taxes_airport"] + extra_tax
    variable = fuel_cost + maint + catering + handling + taxes
    fixed = (
        aircraft["amortization_cost_per_flight"]
        + aircraft["crew_cost_per_flight"]
        + aircraft["insurance_cost_per_flight"]
    )
    total = fixed + variable
    revenue = ntp * np_
    margin = (revenue - total) / total * 100 if total > 0 else 0
    profit = revenue - total

    vpp = variable / max(np_, 1)
    cm = ntp - vpp
    break_even = int(fixed / cm) + 1 if cm > 0 else aircraft["capacity"]

    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO simulations (flight_id, scenario_name, fuel_price_variation, "
            "load_factor_variation, ticket_price_variation, extra_tax, simulated_total_cost, "
            "simulated_revenue, simulated_margin, simulated_fixed, simulated_variable, "
            "simulated_passengers, simulated_ticket_price, break_even_passengers) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                flight["id"], scenario_name, fuel_variation_pct, load_factor_variation_pct,
                ticket_price_variation_pct, extra_tax, total, revenue, margin,
                fixed, variable, np_, ntp, break_even,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    return {
        "scenario_name": scenario_name,
        "new_fuel_price": round(nfp, 4),
        "new_passengers": np_,
        "new_ticket_price": round(ntp, 2),
        "load_factor": round(nl * 100, 1),
        "fixed_costs": round(fixed, 2),
        "variable_costs": round(variable, 2),
        "total_cost": round(total, 2),
        "total_revenue": round(revenue, 2),
        "profit_margin": round(margin, 2),
        "profit_amount": round(profit, 2),
        "break_even_passengers": break_even,
        "is_profitable": revenue >= total,
    }


def get_simulations(flight_id: int) -> list:
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM simulations WHERE flight_id=%s ORDER BY created_at DESC, id DESC", (flight_id,)
        ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            if d.get("created_at") is not None and not isinstance(d["created_at"], str):
                d["created_at"] = d["created_at"].isoformat()
            d["simulated_profit"] = (
                round(d["simulated_revenue"] - d["simulated_total_cost"], 2)
                if d.get("simulated_revenue") is not None and d.get("simulated_total_cost") is not None
                else None
            )
            d["is_profitable"] = (
                d["simulated_revenue"] >= d["simulated_total_cost"]
                if d.get("simulated_revenue") is not None and d.get("simulated_total_cost") is not None
                else None
            )
            # Alias des colonnes complémentaires vers des noms alignés sur le
            # résultat de simulation (permettent de recharger un scénario complet).
            d["fixed_costs"] = d.get("simulated_fixed")
            d["variable_costs"] = d.get("simulated_variable")
            d["new_passengers"] = d.get("simulated_passengers")
            d["new_ticket_price"] = d.get("simulated_ticket_price")
            d["break_even_passengers"] = d.get("break_even_passengers")
            out.append(d)
        return out
    finally:
        conn.close()


def delete_simulation(sim_id: int) -> bool:
    conn = get_connection()
    try:
        cur = conn.execute("DELETE FROM simulations WHERE id=%s", (sim_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def get_dashboard_stats() -> dict:
    conn = get_connection()
    s = {}
    try:
        r = conn.execute(
            "SELECT COUNT(*) AS total, "
            "SUM(CASE WHEN is_profitable=1 THEN 1 ELSE 0 END) AS profitable, "
            "AVG(profit_margin) AS avg_margin, "
            "SUM(total_revenue - total_cost) AS total_profit "
            "FROM cost_results"
        ).fetchone()
        total = r["total"] or 0
        profitable = r["profitable"] or 0
        s["total_flights"] = total
        s["profitable_flights"] = profitable
        s["deficit_count"] = total - profitable
        s["avg_margin"] = r["avg_margin"] or 0
        s["total_profit"] = r["total_profit"] or 0
        s["profitability_rate"] = round(profitable / total * 100) if total > 0 else 0

        rows = conn.execute(
            "SELECT f.flight_number, f.departure_airport, f.arrival_airport, "
            "cr.profit_margin, (cr.total_revenue - cr.total_cost) AS profit "
            "FROM cost_results cr JOIN flights f ON f.id = cr.flight_id "
            "ORDER BY cr.profit_margin DESC LIMIT 5"
        ).fetchall()
        s["top_flights"] = [dict(r) for r in rows]

        rows = conn.execute(
            "SELECT f.flight_number, f.departure_airport, f.arrival_airport, "
            "cr.profit_margin, (cr.total_revenue - cr.total_cost) AS profit "
            "FROM cost_results cr JOIN flights f ON f.id = cr.flight_id "
            "WHERE cr.is_profitable = 0 ORDER BY cr.profit_margin ASC LIMIT 5"
        ).fetchall()
        s["deficit_flights"] = [dict(r) for r in rows]

        r = conn.execute(
            "SELECT AVG(fixed_costs) AS avg_fixed, AVG(variable_costs) AS avg_variable "
            "FROM cost_results"
        ).fetchone()
        s["avg_fixed_costs"] = r["avg_fixed"] or 0
        s["avg_variable_costs"] = r["avg_variable"] or 0

        rows = conn.execute(
            "SELECT a.model, AVG(cr.cost_per_passenger) AS avg_cpp, "
            "AVG(cr.profit_margin) AS avg_margin, COUNT(*) AS flight_count "
            "FROM cost_results cr JOIN flights f ON f.id = cr.flight_id "
            "JOIN aircraft a ON a.id = f.aircraft_id GROUP BY a.model"
        ).fetchall()
        s["by_aircraft"] = [dict(r) for r in rows]
    finally:
        conn.close()
    return s
