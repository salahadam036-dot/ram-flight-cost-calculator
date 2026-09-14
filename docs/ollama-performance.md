# Assistant IA — diagnostic de performance et déploiement GPU

> Ce document s'adresse à toute personne qui récupère le projet et constate que
> l'assistant conversationnel met plusieurs secondes à répondre. Il explique la
> cause du problème, les réglages ajoutés au projet, et **comment lancer la stack
> sur une machine équipée d'un GPU (ex. RTX 4090)**.

## 1. Résumé

Le code de l'application n'est pas en cause. Les performances de l'assistant
dépendent d'une seule chose : **Ollama parvient-il à utiliser un GPU ?**

| | Sans GPU (CPU seul) | Avec GPU |
| --- | --- | --- |
| Vitesse de génération | ~2 jetons/s | ~150 jetons/s |
| Réponse à un simple « bonjour » | 7 à 20 s | < 1 s |
| Processeur vu par Ollama | `100% CPU` | `100% GPU` |

Aucune ligne de code n'est à changer pour passer de l'un à l'autre : seul
l'environnement d'exécution d'Ollama change.

## 2. Ce qui a été mesuré

Environnement du relevé : Apple M4 Max (14 cœurs, 36 Go de RAM), Ollama exécuté
dans le conteneur Docker `ram-ollama`, modèle `llama3.2` (3,2 B, quantification
`Q4_K_M`, 2,9 Go).

| Mesure | Valeur relevée | Valeur attendue sur GPU |
| --- | --- | --- |
| Processeur (`ollama ps`) | **`100% CPU`** | `100% GPU` |
| `size_vram` (API `/api/ps`) | **`0`** octet | ~2,9 Go |
| Génération (`eval`) | **0,9 – 2,1 jetons/s** | 100 – 200 jetons/s |
| Évaluation du prompt | 93 jetons/s | > 1 000 jetons/s |
| Chargement à froid du modèle | **5,9 s** | ~1 s |
| Utilisation CPU pendant l'inférence | **1521 %** (~15 cœurs) | — |
| Réponse réelle (25 jetons) | **19,9 s** | < 1 s |
| Requête complète « hi » via l'API | **6,99 s** | < 1 s |

Extrait des journaux d'Ollama pour une vraie requête de l'application :

```
prompt eval time =  3914.30 ms / 366 tokens (  93.50 tokens per second)
       eval time = 11268.69 ms /  25 tokens (   2.13 tokens per second)
      total time = 15182.99 ms / 391 tokens
```

Le détail décisif est l'utilisation CPU : **1521 %**, soit environ 15 cœurs
sollicités à 100 %. Autrement dit, `llama.cpp` utilisait déjà tous les cœurs
disponibles — il n'y avait donc **aucun réglage de threads à optimiser**. Le
chemin CPU était simplement saturé.

### Mesures reproduites sur une machine GPU

Le même profil a été refait sur un poste **Windows + Docker Desktop (WSL2)** avec
une **RTX 4070 Laptop** (8 Go de VRAM), via la surcharge `docker-compose.gpu.yml` :

| Mesure | Valeur |
| --- | --- |
| Processeur (`ollama ps`) | **`100% GPU`** |
| `size_vram` (API `/api/ps`) | **2,55 Go** |
| Génération (`eval`) | **80 à 86 jetons/s** |
| Évaluation du prompt | **~17 000 à 22 000 jetons/s** |
| Rechargement à froid du modèle | **2,66 s** |
| Appel complet | **2,3 à 5,5 s** selon la longueur de la réponse |

Autrement dit : environ **40 fois** plus rapide qu'en CPU, et la lecture du prompt
devient négligeable (moins de 100 ms) là où elle coûtait près de 4 s sur CPU. Le
seul poste de temps restant est la génération, proportionnelle à la longueur de
la réponse.

## 3. Cause racine

**Docker Desktop sur macOS n'a pas d'accès GPU.** Les conteneurs tournent dans
une machine virtuelle Linux qui n'a aucune vue sur le GPU Apple (Metal). Ollama
détecte donc l'absence de GPU et bascule sur une inférence CPU pure.

Ce n'est pas un bug du projet mais une limite de la plateforme. Sur une machine
Linux équipée d'un GPU NVIDIA, le même conteneur Ollama peut utiliser le GPU et
le facteur est de l'ordre de **50 à 100×**.

Facteurs aggravants constatés sur le poste de mesure (ils n'existent pas
forcément sur la machine GPU) :

- pression mémoire sur l'hôte (164 Mo de RAM libre, 8 Go de mémoire compressée,
  plus de 1,3 M d'échanges disque) — défavorable au chargement par `mmap` ;
- concurrence CPU (charge moyenne 11,9 sur 14 cœurs) ;
- VM Docker limitée à 7,65 Go de RAM sur les 36 Go de la machine.

## 4. Modifications apportées au projet

### `backend/app/config.py`

Trois réglages, tous surchargeables par variable d'environnement :

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `OLLAMA_KEEP_ALIVE` | `30m` | Durée pendant laquelle le modèle reste chargé en mémoire |
| `OLLAMA_NUM_PREDICT` | `1024` | Longueur maximale de la réponse ; détermine aussi la place réservée à la génération dans la fenêtre de contexte |
| `OLLAMA_TIMEOUT` | `180` | Délai maximal d'attente (en secondes) |

Le défaut Ollama pour `keep_alive` est de **5 minutes** : passé ce délai, le
modèle est déchargé et la question suivante paie un rechargement complet depuis
le disque (mesuré : 5,9 s).

Le plafond `num_predict` avait été introduit pour borner le pire cas. En pratique
il **tronquait les réponses en plein milieu** : sur les mesures de cette machine,
3 questions sur 4 s'arrêtaient sur `done_reason=length` à exactement 256 jetons,
parfois au milieu d'un mot (« … pour calculer les co »). Comme le flux est
désormais diffusé au fur et à mesure (voir section 10), l'attente ressentie ne
dépend plus de cette limite : elle a donc été relevée à `1024` jetons, très
au-dessus des réponses observées (150 à 420 jetons).

Cette borne a un second effet, mesuré depuis : **Ollama réserve dans la fenêtre de
contexte autant de place que `num_predict`**. Avec `-1`, il réservait la moitié de la
fenêtre et tronquait le prompt — journaux à l'appui : `truncating input prompt`,
`limit=4098` pour un prompt de 8 951 jetons — ce qui amputait l'instantané de
l'application fourni à l'assistant. Une valeur finie lui laisse au contraire toute la
place. `OLLAMA_TIMEOUT` reste le garde-fou contre une génération qui partirait en
boucle.

### `backend/app/routers/chatbot.py`

- Le `keep_alive` et la longueur maximale `num_predict` sont transmis à Ollama à
  chaque requête.
- **`POST /api/chatbot/stream`** : route ajoutée qui diffuse la réponse au fur et
  à mesure (Server-Sent Events), en relayant le flux NDJSON d'Ollama. Le widget de
  chat l'utilise : le premier mot s'affiche en ~200 ms au lieu d'attendre la fin
  complète de la génération. La route `POST /api/chatbot` (réponse en un bloc)
  reste disponible pour les scripts et `curl`.
- Le délai d'attente n'est plus codé en dur (`timeout=300`) : il vient de
  `OLLAMA_TIMEOUT`.
- Les erreurs sont mieux distinguées : **503** si Ollama n'est pas démarré,
  **504** si le modèle dépasse le délai. Auparavant, un simple dépassement de
  délai produisait le message trompeur « Ollama n'est pas démarré ».

### `docker-compose.yml`

- Service `ollama` : `OLLAMA_KEEP_ALIVE=30m`, `OLLAMA_NUM_PARALLEL=1` et
  `OLLAMA_MAX_LOADED_MODELS=1` (inutile de dupliquer 2,9 Go de poids dans une VM
  limitée en mémoire).
- Ajout d'un `healthcheck` : `docker compose ps` indique désormais si Ollama est
  réellement prêt (`healthy`).
- `OLLAMA_URL` est maintenant surchargeable depuis le fichier `.env`
  (`${OLLAMA_URL:-http://ollama:11434/api/chat}`). La valeur par défaut reste
  strictement identique : aucune configuration existante n'est cassée.

### Effet mesuré

| | Avant | Après |
| --- | --- | --- |
| `load_duration` à froid | 5,92 s | — |
| `load_duration` à chaud | ~5,9 s | **0,49 ms** |
| `ollama ps` → `UNTIL` | 4 min | **29 min** |
| Santé du conteneur | aucune | **healthy** |

Ces réglages suppriment la pénalité de rechargement (~6 s), mais **ils ne
corrigent pas le coût par requête** tant qu'Ollama reste sur CPU. Le vrai
correctif est le GPU : voir la section suivante.

## 5. Déployer avec un GPU (RTX 4090)

C'est la partie à suivre sur la machine équipée du GPU.

### 5.1 Prérequis

1. **Pilote NVIDIA** installé sur l'hôte (`nvidia-smi` doit répondre).
2. **Docker** et le plugin **Docker Compose**.
3. **NVIDIA Container Toolkit** (indispensable : c'est lui qui expose le GPU aux
   conteneurs) :
   ```bash
   sudo apt-get install -y nvidia-container-toolkit
   sudo nvidia-ctk runtime configure --runtime=docker
   sudo systemctl restart docker
   ```

Vérifiez que Docker voit bien le GPU :

```bash
docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi
```

Si cette commande affiche la RTX 4090, tout est en place.

### 5.2 Lancer la stack avec le GPU

Un fichier de surcharge dédié est fourni : `docker-compose.gpu.yml`.

```bash
cp .env.example .env          # puis renseigner RAM_SECRET_KEY (voir README)
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

Le premier démarrage est plus long : Ollama télécharge `llama3.2` (≈ 2 Go).

### 5.3 Vérifier que le GPU est réellement utilisé

C'est l'étape la plus importante — ne la sautez pas.

```bash
docker exec ram-ollama ollama ps
```

Vous devez voir `100% GPU` dans la colonne `PROCESSOR` :

```
NAME               ID              SIZE      PROCESSOR    CONTEXT    UNTIL
llama3.2:latest    a80c4f17acd5    3.1 GB    100% GPU     4096       29 minutes from now
```

Si la colonne affiche `100% CPU`, le GPU n'est **pas** utilisé : voir la
section 8.

Deuxième vérification, côté API — `size_vram` doit être non nul :

```bash
curl -s http://localhost:11434/api/ps
```

```json
{"models":[{"name":"llama3.2:latest","size_vram":3091658560, ...}]}
```

### 5.4 Mesurer la latence

```bash
curl -sS -w '\n--- total: %{time_total}s\n' http://localhost:11434/api/chat \
  -d '{"model":"llama3.2","stream":false,"messages":[{"role":"user","content":"hi"}]}'
```

Le champ `eval_duration` (en nanosecondes) et `eval_count` donnent la vitesse :

```
jetons/s = eval_count / (eval_duration / 1e9)
```

Sur RTX 4090 avec `llama3.2`, comptez de l'ordre de **150 jetons/s**.

### 5.5 Aller plus loin : un modèle plus gros

Une RTX 4090 dispose de **24 Go de VRAM** : `llama3.2` (3 B, ~3 Go) est très
petit pour cette carte. Pour améliorer nettement la qualité des réponses, on
peut passer à un modèle plus gros sans quitter le GPU :

```bash
docker exec ram-ollama ollama pull llama3.1:8b
```

puis, dans `.env` ou `docker-compose.yml` :

```yaml
OLLAMA_MODEL: llama3.1:8b
```

Ordres de grandeur sur 24 Go de VRAM (quantification `Q4_K_M`) :

| Modèle | Taille | Tient en VRAM ? |
| --- | --- | --- |
| `llama3.2` (3 B) | ~3 Go | oui, très large |
| `llama3.1:8b` | ~5 Go | oui |
| `qwen2.5:14b` | ~9 Go | oui |
| `llama3.1:70b` | ~40 Go | non (déborde sur le CPU) |

> ⚠️ Un modèle plus gros que la VRAM disponible provoque un débordement vers le
> CPU et fait **chuter** les performances en dessous du petit modèle. Restez
> sous les 24 Go, en gardant de la marge pour le contexte.

## 6. Alternative : Ollama natif (sans Docker)

Si l'on accepte de sortir Ollama de Docker — utile sur macOS, où le GPU Apple
n'est accessible qu'en natif — il suffit d'installer Ollama sur l'hôte :

```bash
brew install ollama          # macOS
OLLAMA_HOST=0.0.0.0:11434 ollama serve     # terminal 1
ollama pull llama3.2                        # terminal 2
```

Puis, dans `.env` :

```
OLLAMA_URL=http://host.docker.internal:11434/api/chat
```

Sous Linux, remplacer `host.docker.internal` par l'adresse IP de l'hôte (ou
ajouter `extra_hosts: ["host.docker.internal:host-gateway"]` au service
`backend`). Cette variante ne demande **aucune modification de code**, seulement
cette variable.

## 7. Référence des variables

| Variable | Défaut | Où | Rôle |
| --- | --- | --- | --- |
| `OLLAMA_URL` | `http://ollama:11434/api/chat` | backend | URL de l'API Ollama |
| `OLLAMA_MODEL` | `llama3.2` | backend | Modèle utilisé |
| `OLLAMA_KEEP_ALIVE` | `30m` | backend + ollama | Maintien du modèle en mémoire |
| `OLLAMA_NUM_PREDICT` | `1024` | backend | Longueur maximale de la réponse ; détermine aussi la place laissée au prompt |
| `OLLAMA_NUM_CTX` | `16384` | backend | Taille de la fenêtre de contexte, en jetons |
| `OLLAMA_TIMEOUT` | `180` | backend | Délai maximal (secondes) |
| `OLLAMA_NUM_PARALLEL` | `1` | ollama | Requêtes simultanées |
| `OLLAMA_MAX_LOADED_MODELS` | `1` | ollama | Modèles gardés en mémoire |

Ces variables se surchargent via le fichier `.env` (ou directement dans
`docker-compose.yml`).

## 8. Dépannage

| Symptôme | Cause probable | Solution |
| --- | --- | --- |
| `ollama ps` affiche `100% CPU` malgré un GPU présent | NVIDIA Container Toolkit absent ou GPU non transmis | Vérifier §5.1 ; le `deploy.reservations.devices` est bien présent dans `docker-compose.gpu.yml` |
| « could not select device driver » au démarrage | Toolkit non configuré | `sudo nvidia-ctk runtime configure --runtime=docker` puis redémarrer Docker |
| Réponse très lente la première fois | Chargement à froid du modèle | Normal ; `OLLAMA_KEEP_ALIVE=30m` évite que cela se reproduise |
| Erreur « Ollama n'est pas démarré » | Conteneur arrêté | `docker compose up -d ollama` |
| Délai dépassé (HTTP 504) | Génération trop longue | Augmenter `OLLAMA_TIMEOUT`, ou baisser `OLLAMA_NUM_PREDICT` |
| Le modèle déborde sur le CPU | Modèle plus gros que la VRAM | Choisir un modèle plus petit (§5.5) |

## 9. Comment refaire ces mesures

```bash
# 1. Ollama utilise-t-il le GPU ?
docker exec ram-ollama ollama ps

# 2. Détail mémoire GPU (size_vram > 0 = GPU utilisé)
curl -s http://localhost:11434/api/ps

# 3. Latence brute du modèle
curl -sS -w '\n--- %{time_total}s\n' http://localhost:11434/api/chat \
  -d '{"model":"llama3.2","stream":false,"messages":[{"role":"user","content":"hi"}]}'

# 4. Latence de bout en bout (application complète)
curl -sS -w '\n--- %{time_total}s\n' http://localhost:8000/api/chatbot \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer <JETON>" \
  -d '{"messages":[{"role":"user","content":"hi"}]}'

# 5. Utilisation CPU/GPU pendant l'inférence
docker stats --no-stream ram-ollama
```

Tout ceci — et davantage : câblage du frontend, CORS, coûts fixes, démarrage à
froid, requêtes simultanées, latence du premier jeton en flux — est automatisé
dans un script :

```bash
python3 scripts/profile_chatbot.py
```

Le jeton du point 4 s'obtient via :

```bash
curl -s http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
```

## 10. Diffusion en flux (implémentée)

Les réponses étaient auparavant renvoyées **en un bloc** (`stream: false`) : le
client attendait la fin complète de la génération avant d'afficher quoi que ce
soit. Le widget de chat utilise désormais `POST /api/chatbot/stream`, qui relaie le
flux NDJSON d'Ollama vers le navigateur en Server-Sent Events : le texte s'affiche
mot à mot.

Mesures sur cette machine (RTX 4070 Laptop), question « Comment calculer le coût
d'un vol ? » :

| | Avant (bloc) | Après (flux) |
| --- | --- | --- |
| Premier texte affiché | ~4 300 ms | **~206 ms** |
| Réponse complète | ~4 300 ms | ~4 340 ms |

Le temps total est identique, mais l'attente perçue passe de plusieurs secondes
d'écran vide à un affichage quasi immédiat. C'est aussi ce qui permet de supprimer
le plafond `num_predict` sans dégrader l'expérience : une réponse longue n'est
plus pénalisante puisqu'elle se remplit progressivement.
