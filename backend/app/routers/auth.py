from fastapi import APIRouter, HTTPException

from app.database import get_connection
from app.schemas import LoginRequest, TokenOut
from app.security import (
    create_access_token,
    hash_password,
    needs_rehash,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
def login(body: LoginRequest):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM users WHERE username=%s", (body.username,)).fetchone()
    finally:
        conn.close()

    if row is None or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Identifiant ou mot de passe incorrect")

    # Migration transparente : si le hachage stocke est encore en SHA-256
    # (legacy), on le remplace par un hachage bcrypt a la prochaine connexion.
    if needs_rehash(row["password_hash"]):
        _upgrade_password_hash(row["id"], body.password)

    user = {"id": row["id"], "username": row["username"], "role": row["role"]}
    return {
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "user": user,
    }


def _upgrade_password_hash(user_id: int, plain_password: str) -> None:
    """Remplace un hachage legacy par un hachage bcrypt, sans interrompre la connexion."""
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE users SET password_hash=%s WHERE id=%s",
            (hash_password(plain_password), user_id),
        )
        conn.commit()
    finally:
        conn.close()
