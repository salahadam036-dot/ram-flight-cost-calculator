from fastapi import APIRouter, Depends, HTTPException

from app.database import get_connection
from app.deps import require_admin
from app.schemas import UserCreate, UserUpdate
from app.security import hash_password

router = APIRouter(prefix="/users", tags=["users"])


def _to_dict(r) -> dict:
    created_at = r["created_at"]
    if created_at is not None and not isinstance(created_at, str):
        created_at = created_at.isoformat()
    return {
        "id": r["id"],
        "username": r["username"],
        "role": r["role"],
        "created_at": created_at,
    }


@router.get("")
def list_users(_=Depends(require_admin)):
    conn = get_connection()
    try:
        rows = conn.execute("SELECT id, username, role, created_at FROM users ORDER BY id").fetchall()
        return [_to_dict(r) for r in rows]
    finally:
        conn.close()


@router.post("")
def create_user(body: UserCreate, _=Depends(require_admin)):
    username = body.username.strip()
    if not username:
        raise HTTPException(400, "L'identifiant est obligatoire.")
    if len(username) < 3:
        raise HTTPException(400, "L'identifiant doit contenir au moins 3 caracteres.")
    if not body.password:
        raise HTTPException(400, "Le mot de passe est obligatoire.")
    if len(body.password) < 6:
        raise HTTPException(400, "Le mot de passe doit contenir au moins 6 caracteres.")
    if body.role not in ("admin", "analyst"):
        raise HTTPException(400, "Role invalide.")

    conn = get_connection()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (%s,%s,%s) RETURNING id",
            (username, hash_password(body.password), body.role),
        )
        new_id = cur.fetchone()["id"]
        conn.commit()
        row = conn.execute("SELECT * FROM users WHERE id=%s", (new_id,)).fetchone()
    except Exception as e:
        raise HTTPException(400, f"Erreur : {e}")
    finally:
        conn.close()
    return _to_dict(row)


@router.put("/{user_id}")
def update_user(user_id: int, body: UserUpdate, _=Depends(require_admin)):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM users WHERE id=%s", (user_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "Utilisateur introuvable")

        username = body.username if body.username is not None else row["username"]
        role = body.role if body.role is not None else row["role"]
        if role not in ("admin", "analyst"):
            raise HTTPException(400, "Role invalide.")
        if body.password and len(body.password) < 6:
            raise HTTPException(400, "Le mot de passe doit contenir au moins 6 caracteres.")

        if body.password:
            conn.execute(
                "UPDATE users SET username=%s, role=%s, password_hash=%s WHERE id=%s",
                (username, role, hash_password(body.password), user_id),
            )
        else:
            conn.execute(
                "UPDATE users SET username=%s, role=%s WHERE id=%s",
                (username, role, user_id),
            )
        conn.commit()
        row = conn.execute("SELECT * FROM users WHERE id=%s", (user_id,)).fetchone()
        return _to_dict(row)
    finally:
        conn.close()


@router.delete("/{user_id}")
def delete_user(user_id: int, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(400, "Vous ne pouvez pas supprimer votre propre compte.")
    conn = get_connection()
    try:
        conn.execute("DELETE FROM users WHERE id=%s", (user_id,))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}
