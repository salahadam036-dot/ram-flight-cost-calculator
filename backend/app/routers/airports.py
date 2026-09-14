from fastapi import APIRouter, Depends, HTTPException

from app.database import get_connection
from app.deps import get_current_user
from app.schemas import AirportCreate, AirportOut, AirportUpdate

router = APIRouter(prefix="/airports", tags=["airports"])


def _to_dict(r) -> dict:
    return {
        "code": r["code"],
        "name": r["name"],
        "city": r["city"],
        "country": r["country"],
        "landing_fee": r["landing_fee"],
    }


@router.get("", response_model=list[AirportOut])
def list_airports(_=Depends(get_current_user)):
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT code, name, city, country, landing_fee FROM airports ORDER BY code"
        ).fetchall()
    finally:
        conn.close()
    return [_to_dict(r) for r in rows]


@router.post("", response_model=AirportOut)
def create_airport(body: AirportCreate, _=Depends(get_current_user)):
    code = body.code.strip().upper()
    if not code:
        raise HTTPException(400, "Le code IATA est obligatoire.")
    if len(code) != 3 or not code.isalpha():
        raise HTTPException(400, "Le code IATA doit etre compose de 3 lettres (ex: CMN).")
    if not body.name.strip():
        raise HTTPException(400, "Le nom de l'aeroport est obligatoire.")

    conn = get_connection()
    try:
        exists = conn.execute("SELECT code FROM airports WHERE code=%s", (code,)).fetchone()
        if exists is not None:
            raise HTTPException(400, f"Le code {code} existe deja.")
        conn.execute(
            "INSERT INTO airports (code, name, city, country, landing_fee) "
            "VALUES (%s,%s,%s,%s,%s)",
            (code, body.name.strip(), body.city.strip(), body.country.strip(), body.landing_fee),
        )
        conn.commit()
        row = conn.execute(
            "SELECT code, name, city, country, landing_fee FROM airports WHERE code=%s", (code,)
        ).fetchone()
    finally:
        conn.close()
    return _to_dict(row)


@router.put("/{code}", response_model=AirportOut)
def update_airport(code: str, body: AirportUpdate, _=Depends(get_current_user)):
    code = code.strip().upper()
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT code, name, city, country, landing_fee FROM airports WHERE code=%s", (code,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Aeroport introuvable")

        name = body.name.strip() if body.name is not None else row["name"]
        city = body.city.strip() if body.city is not None else row["city"]
        country = body.country.strip() if body.country is not None else row["country"]
        landing_fee = body.landing_fee if body.landing_fee is not None else row["landing_fee"]

        conn.execute(
            "UPDATE airports SET name=%s, city=%s, country=%s, landing_fee=%s WHERE code=%s",
            (name, city, country, landing_fee, code),
        )
        conn.commit()
        row = conn.execute(
            "SELECT code, name, city, country, landing_fee FROM airports WHERE code=%s", (code,)
        ).fetchone()
    finally:
        conn.close()
    return _to_dict(row)


@router.delete("/{code}")
def delete_airport(code: str, _=Depends(get_current_user)):
    code = code.strip().upper()
    conn = get_connection()
    try:
        exists = conn.execute("SELECT code FROM airports WHERE code=%s", (code,)).fetchone()
        if exists is None:
            raise HTTPException(404, "Aeroport introuvable")

        # Cet aéroport est-il encore référencé par des vols ? La clé étrangère
        # empêcherait la suppression ; on le vérifie d'abord pour renvoyer un
        # message explicite plutôt qu'une erreur brute.
        refs = conn.execute(
            "SELECT flight_number FROM flights "
            "WHERE departure_airport=%s OR arrival_airport=%s ORDER BY flight_number",
            (code, code),
        ).fetchall()
        if refs:
            count = len(refs)
            exemples = ", ".join(r["flight_number"] for r in refs[:5])
            suite = "" if count <= 5 else f" et {count - 5} autre(s)"
            raise HTTPException(
                409,
                f"Impossible de supprimer l'aeroport '{code}' : il est encore utilise par "
                f"{count} vol(s) ({exemples}{suite}). Supprimez ou re-affectez d'abord ces vols.",
            )

        conn.execute("DELETE FROM airports WHERE code=%s", (code,))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}
