# Rapport — Choix du modèle pour l'assistant IA

**Objet** : déterminer quel modèle Ollama offrir aux utilisateurs de RAM Flight Cost
Calculator, en comparant le modèle 3B (`llama3.2`) à un modèle plus gros
(`llama3.1:8b`, 8 milliards de paramètres), sur les tâches réelles de l'assistant.

**Date des mesures** : 15 septembre 2026 — deuxième campagne, après recalibrage du jeu
de données de démonstration (185 vols, coûts avion exprimés par heure de vol).

**Machine** : Windows 11, Docker Desktop (WSL2), NVIDIA GeForce RTX 4070 Laptop (8 Go de VRAM)

---

## 1. Contexte

L'assistant reçoit à chaque question un **état complet de l'application** (flotte,
aéroports, indicateurs, liste des vols), soit environ 8 400 jetons de contexte.

Un modèle de 3 milliards de paramètres est rapide, mais il se trompe parfois sur des
questions de comptage ou de classement, et **ses erreurs sont silencieuses** : la
réponse est bien formée, plausible, et pourtant fausse. C'est le pire cas pour un outil
d'aide à la décision. L'objet de ce rapport est de mesurer si un modèle plus gros
corrige ce défaut, et à quel prix.

## 2. Protocole

### 2.1 Dispositif

Le même contexte applicatif (récupéré auprès du backend, donc identique à celui que
reçoit l'assistant en production) et les mêmes questions ont été envoyés à chaque
configuration. Seuls le modèle et la taille de la fenêtre de contexte changent. Les
réglages de génération sont ceux de l'application : `num_predict = 1024`,
`keep_alive = 30m`.

Cinq configurations ont été mesurées :

| Modèle | Fenêtre (`num_ctx`) | Remarque |
| --- | --- | --- |
| `llama3.2:latest` | 16 384 | ancienne configuration de production |
| `llama3.1:8b` | 16 384 | |
| `llama3.1:8b` | 12 288 | |
| `llama3.1:8b` | 10 240 | configuration retenue (voir §5) |
| `llama3.1:8b` | 8 192 | |

### 2.2 Questions de contrôle

Cinq questions dont la réponse exacte est connue dans la base de démonstration. Une
réponse n'est comptée juste que si **toutes** les valeurs attendues y figurent.

| # | Question | Réponse attendue |
| --- | --- | --- |
| 1 | Combien de vols sont enregistrés, et combien sont déficitaires ? | 185 vols, 44 déficitaires |
| 2 | Quel vol a la marge la plus faible ? | AT-866 (CMN-BCN), −18,6 % |
| 3 | Quel avion a la marge moyenne la plus élevée ? | Embraer E190, 8,1 % |
| 4 | Coût par passager moyen du Boeing 787-9 ? | 3 810 MAD |
| 5 | Coût par passager moyen de l'ATR 72-600 ? | 737 MAD |

Les valeurs attendues ont été recontrôlées directement dans la base avant la campagne
(`SELECT` sur `cost_results` et `aircraft`), indépendamment du banc d'essai : elles
correspondent bien aux données.

Le juge automatique (`evaluer()`) ancre chaque correspondance sur les **limites du
nombre** : un contrôle comme `44` n'est pas satisfait par `1 344` ou `440`. Sans cette
précaution, un contexte riche en chiffres (distances, montants, capacités) provoquerait
des faux positifs — donc des scores gonflés.

### 2.3 Métriques relevées

Chargement à froid du modèle, vitesse de lecture du prompt, vitesse de génération,
latence totale par question, mémoire occupée et répartition entre GPU et CPU.

## 3. Résultats

### 3.1 Exactitude

| Configuration | Score | Questions en échec |
| --- | --- | --- |
| `llama3.2:latest`, ctx 16 384 | **3 / 5** | n° 3 (répond Boeing 787-8 à 7,2 %) et n° 4 (ne trouve pas la valeur) |
| `llama3.1:8b`, ctx 16 384 | **4 / 5** | n° 4 (répond « pas directement disponible ») |
| `llama3.1:8b`, ctx 12 288 | **5 / 5** | — |
| `llama3.1:8b`, ctx 10 240 | **5 / 5** | — |
| `llama3.1:8b`, ctx 8 192 | **0 / 5** | les cinq (contexte tronqué, voir §3.3) |

Le modèle 8B répond juste sur les cinq questions dès lors que la fenêtre de contexte
est suffisante. Le 3B échoue sur les deux questions qui demandent de **choisir la bonne
section** du contexte : il lit la liste des vols au lieu des agrégats, ou conclut trop
vite à l'absence de la donnée. Sur la question n° 4, il produit même 526 jetons
(8,4 s) sans jamais donner le chiffre demandé.

Illustration, sur la question n° 4 (coût par passager du Boeing 787-9) :

> **`llama3.2` (3B)** — « Pour connaître le coût par passager moyen du Boeing 787-9,
> nous devons utiliser les informations fournies sur les vols de cet avion.
> Cependant, l'application RAM Flight Cost Calculator nous fournit les coûts variables
> et fixes par heure de… »

> **`llama3.1:8b`** — « D'après la table des vols, le coût par passager moyen du
> Boeing 787-9 est de 3810 MAD, sur les 23 vols enregistrés. »

Le 8B donne le chiffre, sa source et le nombre de vols concernés.

### 3.2 Performances

| Configuration | Génération (médiane) | Latence médiane | Chargement à froid | Lecture du prompt | VRAM occupée / totale | Exécution |
| --- | --- | --- | --- | --- | --- | --- |
| `llama3.2:latest`, ctx 16 384 | **63,8 jetons/s** | **608 ms** | 2 525 ms | 8 382 j en 2 070 ms (4 049 j/s) | 4,06 / 4,06 Go | 100 % GPU |
| `llama3.1:8b`, ctx 8 192 | 39,1 jetons/s | 3 391 ms | 2 519 ms | **4 098 j** en 1 931 ms (2 121 j/s) | 5,81 / 5,81 Go | 100 % GPU |
| `llama3.1:8b`, ctx 10 240 | **35,8 jetons/s** | **1 325 ms** | 2 615 ms | 8 372 j en 4 202 ms (1 992 j/s) | 6,08 / 6,08 Go | **100 % GPU** |
| `llama3.1:8b`, ctx 12 288 | 32,1 jetons/s | 1 265 ms | 3 803 ms | 8 372 j en 4 762 ms (1 758 j/s) | 6,19 / 6,70 Go | 92 % GPU |
| `llama3.1:8b`, ctx 16 384 | 25,6 jetons/s | 1 677 ms | 3 847 ms | 8 372 j en 5 517 ms (1 517 j/s) | 6,31 / 7,26 Go | 87 % GPU |

Trois enseignements :

- **Le 8B est environ 1,8 fois plus lent** à générer dans la configuration retenue
  (35,8 contre 63,8 jetons/s) et lit le prompt **deux fois plus lentement**
  (1 992 contre 4 049 jetons/s). L'écart monte à 2,5× si l'on élargit la fenêtre à
  16 384, à cause du débordement mémoire (voir ci-dessous).
- **Au-delà de 10 240 jetons de fenêtre, le modèle ne tient plus en VRAM.** À 12 288,
  0,51 Go déborde ; à 16 384, 0,95 Go. Le débordement se paie immédiatement : la
  vitesse de génération tombe de 35,8 à 25,6 jetons/s.
- **Le chargement à froid reste raisonnable** (2,5 à 3,8 s) : la pénalité est payée une
  fois par session, pas à chaque question. Il est plus élevé au tout premier
  démarrage, quand les poids ne sont pas encore dans le cache disque (mesuré : 20 s).

### 3.3 Le cas `num_ctx = 8 192` : une fenêtre trop juste

À première vue, cette configuration est la plus attrayante : le modèle tient
entièrement en VRAM (5,81 Go) et génère à 39,1 jetons/s, soit le meilleur débit des
configurations 8B. Elle obtient pourtant **0 / 5**, et les mesures en donnent la raison
exacte.

Le contexte applicatif occupe **8 372 jetons**. Avec une fenêtre de 8 192, il n'y a plus
la place : Ollama **tronque le prompt**. Les journaux le disent sans ambiguïté
(`truncating input prompt`), et le compteur le confirme — tous les autres passages
relèvent 8 372 à 8 401 jetons de prompt, celui-ci **4 098** :

| Fenêtre | Jetons de prompt effectivement traités |
| --- | --- |
| 10 240, 12 288, 16 384 | 8 372 à 8 401 |
| **8 192** | **4 098** |

Autrement dit, le modèle répond sur la moitié du contexte, sans les indicateurs ni les
agrégats. Il ne « se trompe » pas au sens habituel : il invente à partir de données
absentes. Ses réponses le montrent — « le vol 1 : AT-780, CMN-CDG, avec une marge de
+1.3 », « la marge moyenne la plus élevée est de +16.3 pour l'Embraer E190 (vol 145) »,
« il n'y a que deux vols de l'ATR 72-600 dans la liste » — alors que le fichier contient
26 vols d'ATR. La latence s'en ressent aussi : une question a demandé **28,6 s**
(1 009 jetons générés), la médiane montant à 3 391 ms.

Le programme est par ailleurs lancé avec `--context-shift --keep 4` : même si le prompt
tenait, une réponse longue dépasserait la fenêtre et ferait évincer les jetons les plus
anciens, c'est-à-dire le début du contexte. Une fenêtre à peine plus grande que le
prompt n'est donc pas une optimisation, c'est une panne silencieuse.

## 4. Analyse

### 4.1 Le vrai coût du modèle 8B n'est pas la vitesse

Le 8B coûte environ **1,8× le temps de réponse** du 3B dans la configuration retenue
(1 325 contre 608 ms pour ces questions courtes ; l'écart est le même à l'échelle du
débit). Sur des questions plus ouvertes, où les réponses atteignent 200 à 300 jetons,
cela représente quelques secondes de plus. Grâce à la diffusion en flux, le premier mot
apparaît en quelques dizaines de millisecondes : l'écart porte sur la durée totale de
rédaction, pas sur l'attente initiale.

En face, le 3B ne répond correctement qu'à **3 des 5 questions de contrôle**, contre 5
pour le 8B. Ses deux échecs portent précisément sur ce qui fait la valeur de
l'assistant : retrouver un chiffre de synthèse et le donner sans se tromper. Pour un
outil d'analyse de coûts, une réponse fausse mais assurée coûte plus cher qu'une
réponse près de deux fois plus lente.

Il faut noter que le score du 3B s'est **dégradé** entre les deux campagnes (4/5 avant
recalibrage, 5/5 pour la question n° 5 à l'époque et 3/5 aujourd'hui) : sur un jeu de
données plus grand et plus contrasté, le petit modèle décroche davantage. Cela conforte
le choix du 8B, mais rappelle aussi que ces scores ont une variabilité (§6).

### 4.2 Le compromis à choisir

| Priorité | Configuration |
| --- | --- |
| Exactitude maximale avec exécution 100 % GPU | `llama3.1:8b`, ctx **10 240** |
| Exactitude maximale et marge d'historique plus large | `llama3.1:8b`, ctx **12 288** (léger débordement CPU) |
| Vitesse maximale | `llama3.2:latest`, ctx 16 384 |

Sur la machine de mesure, **10 240** est le point d'équilibre : c'est la plus grande
fenêtre qui tient intégralement en VRAM (6,08 Go sur 8), elle obtient 5/5, et elle
laisse environ **1 800 jetons** à l'historique de conversation — soit une bonne dizaine
d'échanges avant saturation. Au-delà de plusieurs échanges suivis, la marge se réduit ;
il faut alors soit passer à 12 288 (en acceptant 0,51 Go sur CPU et 92 % GPU), soit
réduire le budget du contexte applicatif.

## 5. Recommandation

**`llama3.1:8b` avec `num_ctx = 10 240`**, en conservant `num_predict = 1024`.

**Décision appliquée** : `docker-compose.yml` définit
`OLLAMA_MODEL: llama3.1:8b` et `OLLAMA_NUM_CTX: "10240"`, et ces mêmes valeurs sont les
défauts de `backend/app/config.py`. Après bascule, les cinq questions de contrôle sont
justes et le prompt de 8 372 jetons n'est pas tronqué.

Si les conversations longues deviennent courantes, passer `OLLAMA_NUM_CTX` à `12288`
et surveiller la colonne `PROCESSOR` de `docker exec ram-ollama ollama ps` : dès
qu'elle n'affiche plus `100% GPU`, une partie du modèle tourne sur le processeur.

## 6. Limites du protocole

- **Échantillon restreint** : cinq questions, un seul jeu de données. Les scores 3/5 et
  5/5 donnent une tendance, pas une mesure statistique. Le 3B réussit d'ailleurs
  certaines questions de coût par passager, et son score a varié d'une campagne à
  l'autre (4/5 avant recalibrage, 3/5 après) : l'écart entre les deux modèles est réel,
  mais plus faible que ces seuls chiffres ne le suggèrent.
- **Réponses non déterministes** : la température par défaut d'Ollama n'est pas nulle ;
  relancer le banc d'essai peut déplacer une réponse.
- **Une seule machine** : les chiffres de vitesse et de mémoire valent pour une RTX
  4070 Laptop. Sur une carte à 24 Go, le 8B tiendrait avec une fenêtre bien plus large,
  et le compromis changerait.
- **Le juge est automatique** : les réponses sont validées par recherche des valeurs
  attendues, ce qui ne mesure pas la qualité de la rédaction.

## 7. Reproductibilité

```bash
# Rejouer la matrice complète
python3 scripts/benchmark_models.py

# Ne mesurer qu'une configuration : modele:num_ctx
python3 scripts/benchmark_models.py llama3.1:8b:10240

# Résultats détaillés (réponses brutes, métriques par question)
cat /tmp/benchmark_modeles.json
```

Le banc d'essai récupère le contexte applicatif réel auprès du backend : les deux
modèles voient donc exactement ce que voit l'assistant en production. Pour un
diagnostic de performance de l'application elle-même (et non des modèles), voir
`scripts/profile_chatbot.py` ; pour un contrôle du contenu des réponses,
`scripts/verify_chatbot_data.py`.
