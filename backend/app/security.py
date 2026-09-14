import hashlib
import hmac
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import ACCESS_TOKEN_EXPIRE_MINUTES, ALGORITHM, SECRET_KEY

# ── Hachage des mots de passe ─────────────────────────────────────────────
# Les mots de passe sont haches avec bcrypt (lent, sale, resistant au brute
# force). Les anciens hachages SHA-256 (legacy, sans sel) sont encore acceptes
# pour compatibilite lors de la connexion, puis migres silencieusement vers
# bcrypt a la connexion suivante.

_BCRYPT_PREFIX = "$2"


def hash_password(password: str) -> str:
    """Hache un mot de passe en clair avec bcrypt et retourne la chaine stockee."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _sha256_legacy_hash(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def verify_password(password: str, hashed: str) -> bool:
    """Compare un mot de passe en clair a un hachage stocke (bcrypt ou legacy SHA-256)."""
    if hashed.startswith(_BCRYPT_PREFIX):
        try:
            return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
        except ValueError:
            return False
    # Hachage historique : comparaison en temps constant pour eviter le timing attack.
    return hmac.compare_digest(_sha256_legacy_hash(password), hashed)


def needs_rehash(hashed: str) -> bool:
    """True si le hachage stocke doit etre migre vers bcrypt."""
    return not hashed.startswith(_BCRYPT_PREFIX)


# ── Jetons JWT ─────────────────────────────────────────────────────────────
def create_access_token(user: dict) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user["id"]),
        "username": user["username"],
        "role": user["role"],
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
