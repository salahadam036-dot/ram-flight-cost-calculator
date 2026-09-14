# Sécurité & authentification

Ce document résume le modèle de sécurité de l'application.

## Authentification

- L'accès aux fonctionnalités nécessite une connexion (`/login`).
- L'API renvoie un **jeton JWT** (HS256), porté dans l'en-tête
  `Authorization: Bearer <token>`.
- La durée de validité du jeton est configurable via la variable
  `RAM_TOKEN_EXPIRE` (défaut : `720` minutes).
- À l'expiration (ou en cas de jeton invalide), le frontend est automatiquement
  redirigé vers la page de connexion.

## Mots de passe

- Les mots de passe sont hachés avec **bcrypt** (lent, salé, résistant au
  brute-force).
- Les hachages **SHA-256** hérités d'une ancienne version sont encore acceptés
  lors de la connexion, puis **migrés automatiquement** vers bcrypt.
- Les mots de passe ne sont jamais stockés en clair ni renvoyés par l'API.

## Clé secrète

- La variable d'environnement **`RAM_SECRET_KEY`** est **obligatoire** pour démarrer
  le backend (aucune valeur par défaut en dur dans le code).
- Générez une valeur aléatoire robuste :
  ```bash
  python3 -c "import secrets; print(secrets.token_urlsafe(48))"
  ```
- Renseignez-la dans `.env` (copie de `.env.example`) avant `docker compose up`.
- Ne committez jamais `.env` : il est ignoré par Git.

## Rôles et permissions

| Rôle | Fonctionnalités |
| --- | --- |
| `admin` | Accès complet, dont la gestion des utilisateurs (`/users`) |
| `analyst` | Analyse (vols, scénarios, prévision, risque) sans gestion des comptes |

La route `/users` est protégée par `require_admin` (HTTP 403 sinon).

## Comptes de démonstration

| Identifiant | Mot de passe | Rôle |
| --- | --- | --- |
| `admin` | `admin123` | admin |
| `analyste` | `analyste123` | analyst |

> ⚠️ Ces comptes sont créés uniquement lors de la **première initialisation** (base
> vide). En production, changez-les immédiatement ou supprimez-les via l'onglet
> **Utilisateurs**.

## Bonnes pratiques de production

- Renseigner un `RAM_SECRET_KEY` aléatoire (jamais la valeur de démonstration).
- Renseigner un `POSTGRES_PASSWORD` fort (et l'aligner dans `DATABASE_URL`).
- Restreindre l'exposition des ports (ex. ne pas exposer `5432` publiquement).
- Servir le frontend via HTTPS devant une authentification d'entreprise.

Voir aussi : [Architecture](architecture.md) pour la description de l'API et du
modèle de données.
