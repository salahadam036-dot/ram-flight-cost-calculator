# Rapport — Choix du modèle pour l'assistant IA

**Objet** : déterminer quel modèle Ollama offrir aux utilisateurs de RAM Flight Cost
Calculator, en comparant le modèle en place (`llama3.2`, 3 milliards de paramètres) à
un modèle plus gros (`llama3.1:8b`, 8 milliards), sur les tâches réelles de
l'assistant.

**Date des mesures** : 15 septembre 2026
**Machine** : Windows 11, Docker Desktop (WSL2), NVIDIA GeForce RTX 4070 Laptop (8 Go de VRAM)

---

## 1. Contexte

L'assistant reçoit à chaque question un **état complet de l'application** (flotte,
aéroports, indicateurs, liste des vols), soit environ 8 000 jetons de contexte. Les
essais manuels ont montré que le modèle 3B se trompe parfois sur des questions de
comptage ou de classement : interrogé sur le coût par passager de l'ATR 72-600, il a
répondu « 470 MAD » — une valeur qui existe dans la base, mais qui est le prix d'un
billet et non le coût par passager.

Ces erreurs sont **silencieuses** : la réponse est bien formée et plausible. C'est le
pire cas pour un outil d'aide à la décision. L'objet de ce rapport est de mesurer si un
modèle plus gros corrige ce défaut, et à quel prix.

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
| `llama3.2:latest` | 16 384 | configuration actuellement en production |
| `llama3.1:8b` | 16 384 | |
| `llama3.1:8b` | 12 288 | |
| `llama3.1:8b` | 10 240 | |
| `llama3.1:8b` | 8 192 | |

### 2.2 Questions de contrôle

Cinq questions dont la réponse exacte est connue dans la base de démonstration. Une
réponse n'est comptée juste que si **toutes** les valeurs attendues y figurent.

| # | Question | Réponse attendue |
| --- | --- | --- |
| 1 | Combien de vols sont enregistrés, et combien sont déficitaires ? | 178 vols, 94 déficitaires |
| 2 | Quel vol a la marge la plus faible ? | AT-866 (CMN-BCN), −79,6 % |
| 3 | Quel avion a la marge moyenne la plus élevée ? | Boeing 787-9, 30,6 % |
| 4 | Coût par passager moyen du Boeing 787-9 ? | 2 235 MAD |
| 5 | Coût par passager moyen de l'ATR 72-600 ? | 693 MAD |

### 2.3 Métriques relevées

Chargement à froid du modèle, vitesse de lecture du prompt, vitesse de génération,
latence totale par question, mémoire occupée et répartition entre GPU et CPU.

## 3. Résultats

### 3.1 Exactitude

| Configuration | Score | Question en échec |
| --- | --- | --- |
| `llama3.2:latest`, ctx 16 384 | **4 / 5** | n° 5 — a répondu « 470 MAD » |
| `llama3.1:8b`, ctx 8 192 | **4 / 5** | n° 5 — n'a pas trouvé la valeur |
| `llama3.1:8b`, ctx 10 240 | **5 / 5** | — |
| `llama3.1:8b`, ctx 12 288 | **5 / 5** | — |
| `llama3.1:8b`, ctx 16 384 | **5 / 5** | — |

Le modèle 8B répond juste sur les cinq questions dès lors que la fenêtre de contexte
est suffisante. Le 3B échoue sur la question n° 5, celle qui demande de distinguer un
coût par passager d'un prix de billet — c'est-à-dire précisément le type de confusion
qui rend une réponse dangereuse dans un outil de calcul de coûts.

Illustration, sur la question n° 5 :

> **`llama3.2` (3B)** — « Le coût par passager moyen de l'ATR 72-600 est de 470 MAD. »

> **`llama3.1:8b`** — « D'après les données fournies, le coût par passager moyen de
> l'ATR 72-600 est de 693 MAD. (Ce chiffre est indiqué dans la section « PAR AVION »
> sous la rubrique « ATR 72-600 ».) Cependant, veuillez noter que ce chiffre représente
> le coût par passager moyen et non le coût total du vol. »

Le 8B trouve la bonne valeur, cite la section où il l'a lue, et écarte explicitement
l'ambiguïté sur laquelle le 3B a trébuché.

### 3.2 Performances

| Configuration | Génération (médiane) | Latence médiane | Chargement à froid | Lecture du prompt | VRAM occupée / totale | Exécution |
| --- | --- | --- | --- | --- | --- | --- |
| `llama3.2:latest`, ctx 16 384 | **66,4 jetons/s** | **486 ms** | 2 143 ms | 8 029 j en 1 961 ms (4 094 j/s) | 4,06 / 4,06 Go | 100 % GPU |
| `llama3.1:8b`, ctx 8 192 | 36,5 jetons/s | 1 237 ms | 2 758 ms | 8 019 j en 4 034 ms (1 988 j/s) | 5,81 / 5,81 Go | 100 % GPU |
| `llama3.1:8b`, ctx 10 240 | **36,2 jetons/s** | **1 026 ms** | 2 667 ms | 8 019 j en 4 011 ms (1 999 j/s) | 6,08 / 6,08 Go | **100 % GPU** |
| `llama3.1:8b`, ctx 12 288 | 32,5 jetons/s | 1 205 ms | 3 575 ms | 8 019 j en 4 428 ms (1 811 j/s) | 6,19 / 6,70 Go | 92 % GPU |
| `llama3.1:8b`, ctx 16 384 | 25,5 jetons/s | 1 851 ms | 3 911 ms | 8 019 j en 5 178 ms (1 549 j/s) | 6,31 / 7,26 Go | 87 % GPU |

Trois enseignements :

- **Le 8B est environ deux fois plus lent** à générer (36 contre 66 jetons/s) et lit le
  prompt **deux fois plus lentement** (2 000 contre 4 100 jetons/s).
- **Au-delà de 10 240 jetons de fenêtre, le modèle ne tient plus en VRAM.** À 12 288,
  0,51 Go déborde ; à 16 384, 0,95 Go. Le débordement se paie immédiatement : la
  vitesse de génération tombe de 36,2 à 25,5 jetons/s.
- **Le chargement à froid reste raisonnable** (2,7 s) : la pénalité est payée une fois
  par session, pas à chaque question.

### 3.3 Le cas `num_ctx = 8 192` : une fenêtre trop juste

À première vue, cette configuration est la plus attrayante : le modèle tient
entièrement en VRAM (5,81 Go) et génère à 36,5 jetons/s. Elle échoue pourtant, et la
raison mérite d'être notée.

Le contexte applicatif occupe **8 039 jetons**. Avec une fenêtre de 8 192, il ne reste
que **153 jetons** pour la réponse. Or llama.cpp est lancé avec `--context-shift
--keep 4` : lorsque la fenêtre est pleine, il évince les jetons les plus anciens — donc
le début du prompt, c'est-à-dire les formules et les indicateurs de l'application.

Les mesures montrent l'effet. Sur la question n° 4, le modèle a produit **275 jetons en
7 771 ms** (contre 20 à 66 jetons et ≈ 1 000 ms sur les autres questions) et a
divagué avant de finir par tomber juste. Sur la question n° 5, il a renoncé :

> « Selon la liste des vols, l'ATR 72-600 a effectué 24 vols, mais pour savoir le coût
> par passager moyen, nous devons… »

**Conclusion partielle** : la fenêtre de contexte doit couvrir le prompt **et** la
réponse. Une fenêtre juste égale au prompt n'est pas une optimisation, c'est une panne
silencieuse.

## 4. Analyse

### 4.1 Le vrai coût du modèle 8B n'est pas la vitesse

Le 8B coûte environ **2,1× le temps de réponse** du 3B (1 026 contre 486 ms sur ces
questions courtes ; l'écart est le même à l'échelle du débit). Sur les questions plus
ouvertes, où les réponses atteignent 300 à 400 jetons, cela représente environ 3 à 4
secondes au lieu de 2. Grâce à la diffusion en flux, le premier mot apparaît en
quelques centaines de millisecondes : l'écart porte sur la durée totale de rédaction,
pas sur l'attente initiale.

En face, le 3B se trompe **en silence** une fois sur cinq dans ce jeu de contrôle. Pour
un outil d'analyse de coûts, une réponse fausse mais assurée coûte plus cher qu'une
réponse deux fois plus lente.

### 4.2 Le compromis à choisir

| Priorité | Configuration |
| --- | --- |
| Exactitude maximale, réponses courtes, conversations courtes | `llama3.1:8b`, ctx **10 240** |
| Exactitude maximale avec une marge d'historique confortable | `llama3.1:8b`, ctx **12 288** (léger débordement CPU) |
| Vitesse maximale | `llama3.2:latest`, ctx 16 384 |

Sur la machine de mesure, **10 240** est le point d'équilibre : c'est la plus grande
fenêtre qui tient intégralement en VRAM (6,08 Go sur 8), et elle laisse environ
**2 200 jetons** à l'historique de conversation — soit une bonne dizaine d'échanges
avant saturation. Au-delà de 3 à 4 échanges suivis, la marge se réduit ; il faut alors
soit passer à 12 288 (en acceptant 0,51 Go sur CPU), soit réduire le budget du contexte
applicatif.

## 5. Recommandation

**Adopter `llama3.1:8b` avec `num_ctx = 10 240`**, en conservant `num_predict = 1024`.

Mise en œuvre (deux valeurs à changer) :

```yaml
# docker-compose.yml, service backend
OLLAMA_MODEL: llama3.1:8b
```

```bash
# .env (ou backend/app/config.py)
OLLAMA_NUM_CTX=10240
```

Puis `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d`.

Si les conversations longues deviennent courantes, passer `OLLAMA_NUM_CTX` à `12288`
et surveiller la colonne `PROCESSOR` de `docker exec ram-ollama ollama ps` : dès
qu'elle n'affiche plus `100% GPU`, une partie du modèle tourne sur le processeur.

## 6. Limites du protocole

- **Échantillon restreint** : cinq questions, un seul jeu de données. Les scores 4/5 et
  5/5 donnent une tendance, pas une mesure statistique. Le modèle 3B répond d'ailleurs
  correctement à la question n° 5 dans certains essais manuels : l'écart entre les deux
  modèles est réel mais plus faible que ce seul jeu ne le suggère.
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
