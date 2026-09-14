from fastapi import APIRouter, Depends, HTTPException

from app.database import get_connection
from app.deps import get_current_user
from app.schemas import AircraftCreate, AircraftOut, AircraftUpdate

router = APIRouter(prefix="/aircraft", tags=["aircraft"])


def _to_dict(r) -> dict:
    return {
        "id": r["id"],
        "type": r["type"],
        "model": r["model"],
        "capacity": r["capacity"],
        "fuel_consumption_per_hour": r["fuel_consumption_per_hour"],
        "maintenance_cost_per_flight": r["maintenance_cost_per_flight"],
        "amortization_cost_per_flight": r["amortization_cost_per_flight"],
        "crew_cost_per_flight": r["crew_cost_per_flight"],
        "insurance_cost_per_flight": r["insurance_cost_per_flight"],
    }


@router.get("", response_model=list[AircraftOut])
def list_aircraft(_=Depends(get_current_user)):
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM aircraft ORDER BY model").fetchall()
        return [_to_dict(r) for r in rows]
    finally:
        conn.close()


@router.post("", response_model=AircraftOut)
def create_aircraft(body: AircraftCreate, _=Depends(get_current_user)):
    conn = get_connection()
    try:
        cur = conn.execute(
            "INSERT INTO aircraft (type, model, capacity, fuel_consumption_per_hour, "
            "maintenance_cost_per_flight, amortization_cost_per_flight, crew_cost_per_flight, "
            "insurance_cost_per_flight) VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
            (
                body.type, body.model, body.capacity, body.fuel_consumption_per_hour,
                body.maintenance_cost_per_flight, body.amortization_cost_per_flight,
                body.crew_cost_per_flight, body.insurance_cost_per_flight,
            ),
        )
        new_id = cur.fetchone()["id"]
        conn.commit()
        row = conn.execute("SELECT * FROM aircraft WHERE id=%s", (new_id,)).fetchone()
        return _to_dict(row)
    finally:
        conn.close()


@router.put("/{aircraft_id}", response_model=AircraftOut)
def update_aircraft(aircraft_id: int, body: AircraftUpdate, _=Depends(get_current_user)):
    conn = get_connection()
    try:
        exists = conn.execute("SELECT id FROM aircraft WHERE id=%s", (aircraft_id,)).fetchone()
        if exists is None:
            raise HTTPException(404, "Avion introuvable")
        conn.execute(
            "UPDATE aircraft SET type=%s, model=%s, capacity=%s, fuel_consumption_per_hour=%s, "
            "maintenance_cost_per_flight=%s, amortization_cost_per_flight=%s, crew_cost_per_flight=%s, "
            "insurance_cost_per_flight=%s, updated_at=CURRENT_TIMESTAMP WHERE id=%s",
            (
                body.type, body.model, body.capacity, body.fuel_consumption_per_hour,
                body.maintenance_cost_per_flight, body.amortization_cost_per_flight,
                body.crew_cost_per_flight, body.insurance_cost_per_flight, aircraft_id,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM aircraft WHERE id=%s", (aircraft_id,)).fetchone()
        return _to_dict(row)
    finally:
        conn.close()


@router.delete("/{aircraft_id}")
def delete_aircraft(aircraft_id: int, _=Depends(get_current_user)):
    conn = get_connection()
    try:
        exists = conn.execute("SELECT id FROM aircraft WHERE id=%s", (aircraft_id,)).fetchone()
        if exists is None:
            raise HTTPException(404, "Avion introuvable")

        # Vérifie si des vols utilisent encore cet avion (clé étrangère) pour
        # renvoyer un message explicite plutôt qu'une erreur brute.
        refs = conn.execute(
            "SELECT flight_number FROM flights WHERE aircraft_id=%s ORDER BY flight_number",
            (aircraft_id,),
        ).fetchall()
        if refs:
            count = len(refs)
            exemples = ", ".join(r["flight_number"] for r in refs[:5])
            suite = "" if count <= 5 else f" et {count - 5} autre(s)"
            raise HTTPException(
                409,
                f"Impossible de supprimer cet avion : il est encore utilise par "
                f"{count} vol(s) ({exemples}{suite}). Supprimez ou re-affectez d'abord ces vols.",
            )

        conn.execute("DELETE FROM aircraft WHERE id=%s", (aircraft_id,))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}
