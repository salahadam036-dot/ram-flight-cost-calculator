# Royal Air Maroc — Calculateur de coûts des vols

Application d'analyse de la rentabilité des vols : calculez le coût d'un vol,
simulez des scénarios économiques, prévoyez les tendances et optimisez le
rendement.

## À quoi ça sert

Cet outil aide à répondre à des questions concrètes :

- Combien coûte un vol, et est-il rentable ?
- Que se passe-t-il si le carburant augmente ou si le remplissage baisse ?
- À quel prix vendre un billet pour maximiser le profit ?

## Fonctionnalités

- **Tableau de Bord** — vue d'ensemble des performances.
- **Vols** — gestion et calcul du coût de chaque vol (import Excel inclus).
- **Flotte** — caractéristiques et coûts des avions.
- **Scénarios** — simulation « what-if » sur un vol.
- **Prévision** — projection des tendances par régression linéaire.
- **Risque & Rendement** — Monte Carlo, KPI et optimisation du prix.
- **Utilisateurs** — gestion des comptes (admin).
- **Chatbot IA** — assistant intégré (modèle Ollama `llama3.1:8b`).
- **Export PDF** — rapport du tableau de bord.

> 📖 Chaque onglet est décrit en détail dans [`docs/`](docs/README.md).

## Stack technique

**React + Vite + TypeScript + Tailwind CSS + shadcn/ui** (frontend), **FastAPI**
+ **PostgreSQL** (backend), **Ollama** (chatbot) et une coquille **Electron**
pour l'application desktop. Le tout est orchestré avec **Docker Compose**.

## Démarrage rapide (Docker)

Toute la stack (base de données, backend, frontend et Ollama) tourne dans des
conteneurs Docker. Aucune installation locale de Python ou Node n'est requise.

### 1. Prérequis

- [Docker](https://docs.docker.com/engine/install/) et le plugin
  [Docker Compose](https://docs.docker.com/compose/install/).

### 2. Configurer les secrets

```bash
cp .env.example .env
```

Générez une clé secrète aléatoire et renseignez-la dans `.env` :

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

> ⚠️ La variable `RAM_SECRET_KEY` est **obligatoire** : sans elle, le backend
> refuse de démarrer. Ne committez jamais votre fichier `.env` (il est ignoré
> par Git).

### 3. Lancer la stack

```bash
docker compose up -d --build
```

À la fin du démarrage :

| Service      | URL                     |
| ------------ | ----------------------- |
| Frontend     | http://localhost:5173   |
| Backend (API) | http://localhost:8000/api/health |
| Ollama       | http://localhost:11434  |
| PostgreSQL   | localhost:5432          |

Le premier démarrage est un peu plus long : Ollama télécharge automatiquement
le modèle `llama3.1:8b` (≈ 5 Go) s'il n'est pas déjà présent.

#### Variante GPU (NVIDIA)

Si la machine dispose d'un GPU NVIDIA (ex. **RTX 4090**), utilisez la surcharge
fournie `docker-compose.gpu.yml` : l'assistant passe d'environ 2 à 150 jetons/s.

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

> Prérequis : pilote NVIDIA et **NVIDIA Container Toolkit** sur l'hôte.
> Vérifications et dépannage détaillés dans
> [Performance de l'assistant IA](docs/ollama-performance.md).

### 4. Connexion

- Identifiant : `admin`
- Mot de passe : `admin123`

> ⚠️ Ces identifiants de démonstration sont créés au premier démarrage. Pour un
> usage réel, connectez-vous en admin puis modifiez/supprimez-les via l'onglet
> **Utilisateurs**.

## Commandes utiles

```bash
# Voir l'état des conteneurs
docker compose ps

# Voir les logs d'un service
docker compose logs -f backend

# Arrêter la stack
docker compose down

# Arrêter ET supprimer les volumes (réinitialise la base et le modèle)
docker compose down -v

# Reconstruire après une modification du code
docker compose up -d --build
```

## Application desktop (optionnel)

La coquille Electron (`desktop/`) charge le frontend compilé et s'appuie sur le
**backend déjà en cours d'exécution** (conteneurs Docker). Elle ne démarre son
propre backend Python qu'en mode développement (`RAM_DEV=1`).

### Prérequis

1. La stack Docker doit tourner :
   ```bash
   docker compose up -d
   ```
2. Node.js doit être installé localement (pour compiler le frontend).

### Lancer le desktop en développement

```bash
# 1. Compiler le frontend (produit le dossier frontend/dist)
cd frontend
npm install
npm run build

# 2. Installer et lancer la coquille Electron (elle charge ../frontend/dist)
cd ../desktop
npm install
npm start
```

> En mode développement, `npm start` définit `RAM_DEV=1` : si le backend Docker
> n'est pas joignable sur `:8000`, Electron tente de démarrer un backend Python
> local. Pour une utilisation « production », compilez un installeur (ci-dessous),
> qui charge le frontend depuis le bundle et se connecte au backend (Docker).

### Compiler un installeur natif

```bash
cd frontend && npm run build
cd ../desktop
npm run dist:win     # Windows (.exe / NSIS)
# ou
npm run dist:linux   # Linux (AppImage)
```

L'installeur est généré dans `desktop/release/`.

> ⚠️ L'application desktop s'attend à ce que le backend réponde sur
> `http://127.0.0.1:8000` (voir `frontend/.env.production`). Assurez-vous que le
> conteneur `ram-backend` est bien exposé sur le port `8000` avant de lancer
> l'application desktop.

## Architecture

```
┌─────────────┐   HTTP    ┌──────────────┐   SQL    ┌────────────┐
│  Frontend   │ ────────► │   Backend    │ ───────► │ PostgreSQL │
│  React/Vite │  :8000    │   FastAPI    │  :5432   │            │
└─────────────┘           └──────┬───────┘          └────────────┘
                                 │ HTTP
                                 ▼
                           ┌────────────┐
                           │   Ollama   │
                           │  llama3.1  │
                           └────────────┘
```

## Documentation détaillée

- 🎓 [**Guide de présentation & soutenance**](docs/demo-guide.md) — pitch, démo
  pas-à-pas, fonctionnement interne et arguments de défense.
- [Documentation par onglet](docs/README.md)
- [Architecture & modèle de données](docs/architecture.md)
- [Sécurité & authentification](docs/securite.md)
- [Import Excel](docs/import-excel.md)
- [Chatbot IA](docs/chatbot.md)
- [Performance de l'assistant IA & déploiement GPU](docs/ollama-performance.md)

## Notes techniques

- La régression linéaire s'appuie sur `scipy.stats.linregress` ; le Monte Carlo,
  l'histogramme et l'optimisation par balayage sont vectorisés avec **NumPy**
  (aucune dépendance sklearn).
- Les mots de passe sont hachés avec **bcrypt**. Les anciens hachages SHA-256
  (version antérieure) sont migrés automatiquement à la connexion.
- Le chatbot utilise un modèle Ollama (`llama3.1:8b`), pré-chargé au démarrage du
  conteneur `ollama`.
- Les performances de l'assistant dépendent fortement de la présence d'un GPU
  (facteur ~50-100×). Diagnostic complet et procédure GPU dans
  [`docs/ollama-performance.md`](docs/ollama-performance.md).
- L'export PDF utilise `reportlab` ; l'import Excel utilise `openpyxl`.
- La base de données est pré-remplie avec des données de démonstration réalistes
  (avions, aéroports, vols) à la première initialisation.
