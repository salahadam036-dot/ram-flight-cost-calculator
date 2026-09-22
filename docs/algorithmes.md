# Algorithmes de l'application — analyse détaillée

Ce document recense **tous les algorithmes et traitements calculatoires** de
**RAM Flight Cost Calculator**, zone par zone. Pour chacun sont précisés :
l'objectif, les entrées, le principe de calcul, les formules exactes, le
traitement étape par étape, les sorties, la complexité et les hypothèses.

Il s'adresse à quiconque doit comprendre, auditer, défendre ou faire évoluer le
calcul de l'application — pas seulement l'utiliser.

---

## Sommaire

1. [Périmètre et méthode](#1-périmètre-et-méthode)
2. [Modèle de coût](#2-modèle-de-coût--servicescostpy)
3. [Simulation de scénarios](#3-simulation-de-scénarios--servicescostpy)
4. [Agrégations du tableau de bord](#4-agrégations-du-tableau-de-bord--servicescostpy)
5. [Risque & Rendement](#5-risque--rendement--servicesdecisionpy)
6. [Prévision](#6-prévision--servicesforecastpy)
7. [Contexte de l'assistant IA](#7-contexte-de-lassistant-ia--servicesapp_contextpy)
8. [Sécurité et authentification](#8-sécurité-et-authentification--securitypy)
9. [Import Excel](#9-import-excel--routersflightspy)
10. [Génération des données de démonstration](#10-génération-des-données-de-démonstration--seed_datapy)
11. [Tri côté frontend](#11-tri-côté-frontend--libusesortts)
12. [Scripts de mesure et de vérification](#12-scripts-de-mesure-et-de-vérification)
13. [Synthèse des hypothèses et points d'attention](#13-synthèse-des-hypothèses-et-points-dattention)
14. [Récapitulatif des complexités](#14-récapitulatif-des-complexités)

---

## 1. Périmètre et méthode

### 1.1 Méthode de recensement

L'inventaire a été établi par lecture du code source : l'intégralité des services
et des routeurs du backend, puis recherche ciblée dans le frontend, les scripts
et le schéma de base de données.

| Zone | Fichier | Rôle algorithmique |
| --- | --- | --- |
| Modèle de coût | `backend/app/services/cost.py` | Décomposition linéaire des coûts, seuil de rentabilité |
| Scénarios | `backend/app/services/cost.py` | Analyse de sensibilité déterministe |
| Tableau de bord | `backend/app/services/cost.py` | Agrégation SQL, classements top/flop 5 |
| Risque & Rendement | `backend/app/services/decision.py` | KPI, Monte Carlo, optimisation sur grille |
| Prévision | `backend/app/services/forecast.py` | Régression linéaire (moindres carrés) |
| Assistant IA | `backend/app/services/app_context.py` | Empaquetage sous contrainte de budget |
| Sécurité | `backend/app/security.py` | bcrypt, comparaison à temps constant, JWT |
| Import Excel | `backend/app/routers/flights.py` | Analyse et validation de fichier |
| Données de démo | `backend/app/seed_data.py` | Génération déterministe de séries |
| Tri des tableaux | `frontend/src/lib/useSort.ts` | Comparateur générique |
| Bancs d'essai | `scripts/*.py` | Mesure, profilage, vérification |

### 1.2 Ce que l'application **ne** contient **pas**

Ces absences ont été vérifiées par recherche dans tout le dépôt. Elles sont
précisées ici pour éviter des recherches inutiles lors d'un audit.

- **Aucun algorithme d'apprentissage automatique.** Pas de réseau de neurones,
  pas de modèle entraîné, pas de clustering, pas de classification. Le seul
  composant « IA » est un modèle de langage externe (Ollama / `llama3.1:8b`)
  appelé par HTTP ; il ne participe à aucun calcul métier.
- **Aucun calcul géodésique.** Il n'existe ni formule de haversine, ni calcul
  de distance orthodromique dans le code. Le champ `distance_km` est une donnée
  **saisie** (ou importée), jamais dérivée de coordonnées. La table `airports`
  ne contient d'ailleurs **aucune latitude ni longitude**. Le mot
  « orthodromique » n'apparaît que dans des commentaires décrivant la
  *provenance* des constantes (voir `seed_data.py:18-22`).
- **Aucune logique algorithmique côté base de données.** `database.py` ne
  contient que du DDL (`CREATE TABLE`, clés étrangères). Aucun déclencheur
  (`TRIGGER`), aucune vue, aucune fonction stockée, aucune procédure. Tout le
  calcul est applicatif.
- **Aucun calcul métier côté frontend.** L'interface ne fait que formater et
  trier ; toute la mathématique est serveur.

---

## 2. Modèle de coût — `services/cost.py`

### 2.1 Objectif

Calculer le coût d'exploitation d'une rotation (un vol), le revenu associé, et
en déduire la rentabilité. C'est le cœur métier de l'application : tous les
autres onglets s'appuient sur son résultat.

Fonction principale : `compute_cost(flight, aircraft)`, `cost.py:4-55`.

### 2.2 Principe directeur : l'heure de vol comme unité

La décision de conception structurante est d'**exprimer les coûts
d'exploitation de l'appareil par heure de vol** (amortissement, équipage,
assurance, maintenance) puis de les **multiplier par la durée du vol**.

La justification est explicitée dans la docstring du code : un vol de 8 heures
immobilise l'appareil et son équipage huit fois plus longtemps qu'un vol d'une
heure. Un modèle « coût par vol » forfaitaire serait donc faux : il rendrait
mécaniquement les longs-courriers anormalement rentables.

### 2.3 Formules exactes

Soit :

| Symbole | Grandeur | Origine |
| --- | --- | --- |
| `H` | `duration_hours` | Vol |
| `P` | `passengers` | Vol |
| `CAP` | `capacity` | Avion |
| `prix_billet` | `ticket_price_avg` | Vol |
| `prix_carburant` | `fuel_price_per_liter` | Vol |
| `conso` | `fuel_consumption_per_hour` | Avion |

**Coûts fixes** — proportionnels à la durée :

```
FIXE = (amortissement_horaire + équipage_horaire + assurance_horaire) × H
```

**Coûts variables** — un mélange d'éléments horaires et par passager :

```
CARBURANT = (conso × H) × prix_carburant
MAINTENANCE = maintenance_horaire × H
CATERING = catering_par_pax × P
VARIABLE = CARBURANT + MAINTENANCE + CATERING + handling + taxes_aéroport
```

**Totaux et indicateurs :**

```
COÛT_TOTAL     = FIXE + VARIABLE
REVENU         = prix_billet × P
COÛT_PAR_PAX   = COÛT_TOTAL / max(P, 1)
COÛT_VAR_PAR_PAX = VARIABLE / max(P, 1)
MARGE_UNITAIRE = prix_billet − COÛT_VAR_PAR_PAX        (contribution)
SEUIL_RENTABILITÉ = int(FIXE / MARGE_UNITAIRE) + 1     si MARGE_UNITAIRE > 0
                    sinon capacity de l'avion          (garde-fou)
MARGE_%        = (REVENU − COÛT_TOTAL) / COÛT_TOTAL × 100   si COÛT_TOTAL > 0
                 sinon 0
RENTABLE       = REVENU ≥ COÛT_TOTAL
```

Le **seuil de rentabilité** (`break_even_passengers`) repose sur la notion de
**marge sur coût variable** : chaque passager supplémentaire rapporte
`prix_billet − coût_variable_par_passager`, et ce gain doit d'abord absorber les
coûts fixes, qui ne dépendent pas du remplissage.

### 2.4 Traitement étape par étape

1. Extraction de `hours` et calcul des trois postes fixes, sommés.
2. Conversion de la consommation horaire en litres consommés sur la rotation,
   puis multiplication par le prix du litre.
3. Calcul des quatre autres postes variables, sommés.
4. Total, revenu, puis les cinq indicateurs dérivés.
5. Retour d'un dictionnaire plat (indicateurs) **plus** un sous-dictionnaire
   `detail` donnant la ventilation poste par poste — c'est cette ventilation
   qu'affiche l'onglet Vols.

Les divisions par `max(P, 1)` protègent explicitement le cas des **vols cargo**
(`passengers = 0`), pour lesquels un coût par passager n'a pas de sens : la
valeur reste définie plutôt que de lever une division par zéro.

### 2.5 Exemple numérique complet

Traçons le calcul sur le premier vol de démonstration : **AT-780, CMN → CDG**,
Boeing 737-800, semaine 0 du jeu de données (`seed_data.py:136-141` et
`DEMO_AIRCRAFT` `seed_data.py:49`).

**Entrées** — `H = 2,95 h` ; `P = 155` ; `prix_billet = 1420` ;
`prix_carburant = 9,05` ; avion : capacité 189, conso 2 600 L/h,
maintenance 10 700/h, amortissement 6 800/h, équipage 17 500/h, assurance 700/h ;
catering 75/pax ; handling 16 000 ; taxes 15 000.

| Étape | Calcul | Résultat (MAD) |
| --- | --- | --- |
| Amortissement | 6 800 × 2,95 | 20 060,00 |
| Équipage | 17 500 × 2,95 | 51 625,00 |
| Assurance | 700 × 2,95 | 2 065,00 |
| **Coûts fixes** | somme des trois | **73 750,00** |
| Carburant (litres) | 2 600 × 2,95 | 7 670 L |
| Carburant (coût) | 7 670 × 9,05 | 69 413,50 |
| Maintenance | 10 700 × 2,95 | 31 565,00 |
| Catering | 75 × 155 | 11 625,00 |
| Handling | — | 16 000,00 |
| Taxes | — | 15 000,00 |
| **Coûts variables** | somme | **143 603,50** |
| **Coût total** | 73 750 + 143 603,50 | **217 353,50** |
| **Revenu** | 1 420 × 155 | **220 100,00** |
| Coût par passager | 217 353,50 / 155 | 1 402,28 |
| Coût variable / pax | 143 603,50 / 155 | 926,47 |
| Marge unitaire | 1 420 − 926,47 | 493,53 |
| Seuil de rentabilité | 73 750 / 493,53 = 149,43 → 149 + 1 | **150 pax** |
| Marge | (220 100 − 217 353,50) / 217 353,50 × 100 | **+1,26 %** |
| Rentable | 220 100 ≥ 217 353,50 | **oui** |

Ce tracé est instructif : le vol est rentable, mais **de justesse** — 150
passagers sur 189 sièges (79 % de remplissage) sont nécessaires pour couvrir les
coûts fixes, et la marge résiduelle n'est que de 1,26 %.

### 2.6 Persistance et idempotence

`save_cost_result` (`cost.py:58-85`) écrit le résultat en **UPSERT** :

```sql
INSERT INTO cost_results (...) VALUES (...)
ON CONFLICT (flight_id) DO UPDATE SET ...
```

Un recalcul écrase donc le précédent au lieu d'empiler des lignes : le
recalcul est **idempotent** et la table contient au plus un résultat par vol,
grâce à la contrainte `UNIQUE` sur `flight_id`. C'est ce qui rend le bouton
« Recalculer » sûr à répéter.

### 2.7 Complexité

`compute_cost` est en **O(1)** : un nombre constant d'opérations arithmétiques,
indépendant du volume de données. La lecture en base est une requête par clé
primaire.

### 2.8 Hypothèses et limites

- **Linéarité stricte.** Aucun effet de seuil, de palier tarifaire, de
  dégressivité ni d'économie d'échelle n'est modélisé.
- **Le catering est le seul poste vraiment proportionnel au passager** ;
  carburant, maintenance, amortissement, équipage et assurance dépendent du
  temps, pas du remplissage. Cela signifie qu'un vol à moitié vide coûte
  presque aussi cher qu'un vol plein — propriété réaliste et volontairement
  retenue, mais qui explique la sensibilité du modèle au taux de remplissage.
- **`handling` et `taxes_aéroport` sont des montants forfaitaires** saisis
  manuellement, non dérivés de la table `airports` (qui contient pourtant une
  `landing_fee`). Il n'y a donc pas de lien automatique entre la redevance
  d'un aéroport et le coût du vol qui l'utilise.

---

## 3. Simulation de scénarios — `services/cost.py`

### 3.1 Objectif et nature de l'algorithme

Répondre à des questions « what-if » : *que devient la marge si le kérosène
grimpe de 50 % ? si le remplissage s'effondre ?*

Point important pour l'audit : il s'agit d'une **analyse de sensibilité
déterministe**, et **non** d'une simulation de Monte Carlo. Chaque scénario
applique un choc connu et reproductible, sans aucun tirage aléatoire. C'est le
contraire de l'onglet Risque (section 5.3), qui, lui, tire des milliers de
valeurs au hasard.

Fonction : `simulate(...)`, `cost.py:140-203`.

### 3.2 Paramètres de choc

Quatre leviers, tous optionnels et cumulables :

| Paramètre | Effet |
| --- | --- |
| `fuel_variation_pct` | Variation relative du prix du litre |
| `load_factor_variation_pct` | Variation en **points** du taux de remplissage |
| `ticket_price_variation_pct` | Variation relative du prix du billet |
| `extra_tax` | Montant fixe ajouté aux taxes |

### 3.3 Formules

```
nouveau_prix_carburant = prix_carburant × (1 + variation_carburant / 100)

taux_de_base   = passagers / capacité
nouveau_taux   = max(0,01 ; min(1,00 ; taux_de_base + variation_remplissage / 100))
nouveaux_pax   = max(1 ; int(capacité × nouveau_taux))

nouveau_prix_billet = prix_billet × (1 + variation_billet / 100)
nouvelles_taxes     = taxes_aéroport + extra_tax
```

Le reste du modèle de coût (section 2) est réappliqué **à l'identique** sur ces
valeurs choquées, y compris le recalcul du seuil de rentabilité.

### 3.4 Le double garde-fou du taux de remplissage

```
max(0,01 ; min(1,00 ; ...))
```

- `min(1,00)` empêche un taux de remplissage **supérieur à 100 %** : on ne peut
  pas vendre plus de sièges qu'il n'y en a. Sans cette borne, une variation de
  +30 points sur un vol déjà plein produirait un nombre de passagers
  économiquement impossible.
- `max(0,01)` empêche un taux **nul ou négatif** : une variation de −100 %
  ferait disparaître tout revenu et rendrait le seuil de rentabilité
  indéfini (division par zéro dans la marge unitaire). Le plancher garantit
  qu'il reste au moins un passager.

Un `max(1, ...)` s'ajoute sur le nombre entier de passagers, pour la même raison.

### 3.5 Les scénarios prédéfinis

`routers/simulation.py:22-65` définit sept presets, qui ne sont que des
combinaisons de chocs :

| Preset | Carburant | Remplissage | Billet | Taxe |
| --- | --- | --- | --- | --- |
| Krach du carburant | −40 % | — | — | — |
| Choc pétrolier | +50 % | — | — | — |
| Pic de demande | — | +30 pts | +15 % | — |
| Sous-remplissage | — | −40 pts | — | — |
| Guerre des prix | — | +5 pts | −25 % | — |
| Nouvelle taxe | — | — | — | +15 000 |
| Crise globale | +30 % | −25 pts | −10 % | +5 000 |

### 3.6 Sorties

Le résultat comprend les valeurs choquées (`new_passengers`,
`new_fuel_price`, `new_ticket_price`, `load_factor`), la ventilation des coûts
recalculée, le profit en montant, le seuil de rentabilité et un booléen de
rentabilité. Chaque simulation est **historisée** dans la table `simulations`,
ce qui permet de rejouer un scénario et de comparer plusieurs hypothèses sur un
même vol (`get_simulations`, `cost.py:206-237`).

### 3.7 Complexité

**O(1)** : une vingtaine d'opérations arithmétiques, indépendamment de la taille
de la base.

### 3.8 Hypothèses et limites

- **Les chocs sont indépendants.** Rien n'interdit de simuler simultanément une
  hausse du carburant et une hausse du prix du billet, alors qu'en économie
  réelle une hausse du carburant pousse souvent les tarifs à la hausse. Aucune
  corrélation n'est modélisée.
- **La demande ne réagit pas au prix.** Dans cet onglet, augmenter le prix du
  billet augmente mécaniquement le revenu, à passagers constants. C'est
  précisément l'hypothèse que l'optimiseur du section 5.4 corrige.
- **La variation de remplissage est additive en points, pas multiplicative en
  pourcentage.** +30 signifie « +30 points de pourcentage », pas « +30 % du
  remplissage actuel ». C'est un choix d'ergonomie cohérent, mais qui doit être
  connu pour interpréter correctement les chiffres.

---

## 4. Agrégations du tableau de bord — `services/cost.py`

### 4.1 Objectif

Produire les indicateurs de synthèse affichés sur le Tableau de Bord et
exportés en PDF.

Fonction : `get_dashboard_stats()`, `cost.py:250-302`.

### 4.2 Principe : le calcul est délégué à PostgreSQL

Particularité architecturale à souligner : cette zone **n'implémente aucun
algorithme en Python**. Toutes les statistiques sont calculées par cinq requêtes
SQL d'agrégation, puis transmises telles quelles.

### 4.3 Les cinq requêtes

**a) Statistiques globales** — un seul passage sur `cost_results` :

```sql
SELECT COUNT(*)                                        AS total,
       SUM(CASE WHEN is_profitable=1 THEN 1 ELSE 0 END) AS profitable,
       AVG(profit_margin)                              AS avg_margin,
       SUM(total_revenue - total_cost)                 AS total_profit
FROM cost_results
```

En sont dérivés : le nombre de vols déficitaires (`total − profitable`), le
profit cumulé, et le **taux de rentabilité** :

```
TAUX_RENTABILITÉ = arrondi( profitable / total × 100 )   si total > 0
                   sinon 0
```

**b) Les 5 meilleurs vols** — classement décroissant sur la marge, limité :

```sql
... ORDER BY cr.profit_margin DESC LIMIT 5
```

**c) Les 5 plus fortes pertes** — classement croissant, **restreint aux vols
non rentables** (`WHERE cr.is_profitable = 0`) :

```sql
... WHERE cr.is_profitable = 0 ORDER BY cr.profit_margin ASC LIMIT 5
```

Le filtre est essentiel : sans lui, le « flop 5 » afficherait parfois des vols
à marge positive mais faible, ce qui serait trompeur sur un panneau intitulé
« vols déficitaires ».

**d) Moyennes de coûts** — `AVG(fixed_costs)`, `AVG(variable_costs)`.

**e) Synthèse par appareil** — regroupement par modèle :

```sql
SELECT a.model, AVG(cr.cost_per_passenger) AS avg_cpp,
       AVG(cr.profit_margin) AS avg_margin, COUNT(*) AS flight_count
FROM cost_results cr
JOIN flights f  ON f.id = cr.flight_id
JOIN aircraft a ON a.id = f.aircraft_id
GROUP BY a.model
```

**Algorithmes sous-jacents** : statistiques descriptives (moyenne arithmétique,
comptage conditionnel, somme) et **sélection des k-extrêmes** par tri puis
troncature. Aucune moyenne pondérée n'est utilisée : chaque vol compte pour un,
quelle que soit sa taille. Cette moyenne « par vol » est sensible aux petits
vols, contrairement à une moyenne pondérée par les passagers ou les sièges-km.

### 4.4 Complexité

Dominée par PostgreSQL : **O(N log N)** pour les tris (`ORDER BY … LIMIT`) et
**O(N)** pour les agrégats, avec N le nombre de vols dont le coût est calculé.
En pratique, un index approprié ramène les tris à un parcours d'index.

---

## 5. Risque & Rendement — `services/decision.py`

C'est la zone la plus riche sur le plan algorithmique : elle contient les
**trois seuls algorithmes véritablement non triviaux** de l'application.

### 5.1 Indicateurs aéronautiques (KPI) — `compute_kpis:8-49`

**Objectif** : mesurer la performance d'un vol avec les unités standard du
transport aérien, afin de comparer des vols de tailles très différentes.

**Formules** (avec `D = distance_km`, `CAP = capacité`, `P = passagers`) :

```
ASK  (sièges-km offerts)     = CAP × D          « capacité offerte »
RPK  (passagers-km payants)  = P × D            « capacité vendue »
TAUX DE REMPLISSAGE          = P / CAP × 100
RASK (revenu unitaire)       = revenu / ASK     « ce que rapporte un siège-km »
CASK (coût unitaire)         = coût   / ASK     « ce que coûte un siège-km »
YIELD                        = revenu / RPK     « recette par passager-km »
BELF (seuil de rentabilité)  = CASK / RASK × 100
MARGE UNITAIRE               = RASK − CASK
```

**Logique** : ASK et RPK normalisent par la distance, ce qui rend comparables
un vol régional et un long-courrier. RASK et CASK normalisent par les sièges-km,
donc par l'offre : leur différence est le profit par unité de production.

**Complexité** : **O(1)**.

**Hypothèses et limites** :

- Le **BELF** défini comme `CASK / RASK` est la définition simplifiée
  usuelle. Elle n'est rigoureusement exacte que si les coûts sont indépendants
  du remplissage. Ici, le coût par passager augmente quand le vol se vide, donc
  le BELF est une **approximation** — un ordre de grandeur, pas une égalité
  stricte.
- Les KPI sont calculés sur **la rotation isolée**, sans allocation des coûts
  indirects de la compagnie (structure, marketing, distribution).

### 5.2 Histogramme — `_build_histogram:52-67`

**Objectif** : représenter la distribution des profits issus du Monte Carlo.

**Algorithme** : histogramme à **classes de largeur égale** (40 classes par
défaut), construit avec numpy :

```
largeur = (max − min) / 40
indice(i) = floor( (x_i − min) / largeur )
indice(i) ← borné dans [0, 39]          (np.clip)
effectif(j) = nombre de x_i d'indice j  (np.bincount)
```

**Garde-fou** : si `max == min` (série constante, cas d'un vol parfaitement
déterministe), la largeur vaudrait zéro. Le code substitue alors
`max = min + 1` pour rester défini.

Le **centre** de chaque classe (`min + (i + 0,5) × largeur`) est renvoyé en plus
du libellé, ce qui permet au graphique de positionner correctement les barres.

**Complexité** : **O(S + B)** pour S simulations et B classes.

### 5.3 Simulation de Monte Carlo — `monte_carlo:70-152`

**Objectif** : chiffrer l'**incertitude**. Là où le modèle de coût donne une
marge unique, le Monte Carlo donne une *distribution* de marges possibles et
répond à la question : *quelle est la probabilité que ce vol perde de
l'argent ?*

**Entrées** : nombre de simulations `n` (défaut 5 000) et un écart-type par
facteur incertain — carburant, passagers, prix du billet (10 % par défaut
chacun).

#### Étape 1 — Générateur aléatoire reproductible

```python
rng = np.random.default_rng(42)
```

Le générateur est **PCG64** (générateur à congruence polynomiale, standard
moderne) et la **graine est fixée à 42**. Conséquence majeure : les résultats
sont **strictement reproductibles**. Relancer deux fois « 5 000 simulations »
avec les mêmes entrées donne exactement les mêmes chiffres. C'est un choix
assumé — il rend la démonstration et le test fiables — mais il faut savoir que
la variance observée n'est pas une précision qui s'améliore si l'on relance :
seul l'augmentation de `n` resserre réellement l'incertitude.

#### Étape 2 — Chocs multiplicatifs

Pour chaque facteur, un facteur multiplicatif est tiré dans une loi normale
centrée sur 1 (donc « pas de changement en moyenne ») :

```
facteur_carburant ~ N(1, σ_carburant)
facteur_passagers ~ N(1, σ_passagers)
facteur_billet    ~ N(1, σ_billet)
```

puis borné inférieurement à `0,1` (`np.maximum`) : cela interdit un prix ou un
nombre de passagers **négatif**, ce que la queue gauche d'une loi normale
finirait par produire sur 5 000 tirages.

#### Étape 3 — Application aux grandeurs physiques

```
prix_carburant_simulé = prix_carburant × facteur_carburant
passagers_bruts       = floor( passagers × facteur_passagers )
passagers_simulés     = min( capacité ; max(1 ; passagers_bruts) )
prix_billet_simulé    = prix_billet × facteur_billet
```

La **contrainte de capacité** est appliquée après le tirage : on ne transporte
jamais plus de passagers que de sièges. C'est un plafonnement, non un rejet,
donc chaque tirage reste exploitable.

#### Étape 4 — Recours au modèle de coût

Le modèle de la section 2 est réappliqué **vectorisé** sur les n scénarios
simultanément (numpy), sans boucle Python : coûts fixes, variables, total,
revenu, profit. C'est ce qui permet de traiter 5 000 scénarios instantanément.

#### Étape 5 — Statistiques de sortie

| Indicateur | Formule | Interprétation |
| --- | --- | --- |
| Profit moyen | `mean(profits)` | Espérance du résultat |
| Profit médian | `median(profits)` | Résultat central, insensible aux extrêmes |
| Écart-type | `std(profits, ddof=1)` | Volatilité (**écart-type d'échantillon**) |
| **Probabilité de perte** | `count(profits < 0) / n × 100` | Risque de perte |
| **VaR 95 %** | `percentile(profits, 5)` | Perte dans les 5 % de cas les plus durs |
| Fourchette 95 % | `percentile(profits, 2,5)` … `percentile(profits, 97,5)` | Plage centrale |
| **IC 95 % de la moyenne** | `moyenne ± 1,96 × σ/√n` | Précision de l'estimation |

Le choix de `ddof=1` (au lieu de `ddof=0`) est correct : les tirages sont un
**échantillon**, non la population entière, donc on divise par `n − 1`.

L'**intervalle de confiance de la moyenne** s'appuie sur le **théorème central
limite** : l'erreur-type de la moyenne vaut `σ/√n`, et pour un grand échantillon
la statistique est approximativement normale, d'où le coefficient 1,96
(`stats.norm.ppf(0,975)`). Il faut bien distinguer les deux notions :

- la **fourchette 95 %** (2,5 – 97,5 %) décrit la dispersion d'**un vol
  particulier** — c'est là que tombera le résultat ;
- l'**IC 95 % de la moyenne** décrit la précision de l'**estimation de
  l'espérance** — et se resserre quand `n` augmente.

Exemple d'ordre de grandeur : avec une moyenne de 5 000 MAD, un écart-type de
8 000 MAD et `n = 5 000`, l'erreur-type vaut `8 000/√5 000 ≈ 113`, soit un IC de
`5 000 ± 222`. La volatilité du vol (8 000) est énorme, mais la précision de
l'estimation (222) est excellente : les deux chiffres mesurent des choses
différentes.

#### Étape 6 — Verdict

Un seuil sur la probabilité de perte produit quatre verdicts, avec un code
couleur pour l'interface :

| Probabilité de perte | Verdict | Couleur |
| --- | --- | --- |
| < 10 % | Vol très sûr | `#00D4A0` (vert) |
| < 25 % | Acceptable, risque modéré | `#D4A843` (or) |
| < 50 % | Risqué, probabilité de perte élevée | `#C8102E` (rouge) |
| ≥ 50 % | Très risqué, majoritairement déficitaire | `#C8102E` (rouge) |

Les deux derniers paliers partagent volontairement la même couleur : au-delà de
50 %, l'information utile est « le vol est majoritairement déficitaire », et non
le degré exact du danger.

#### Complexité

**O(n)** en temps, entièrement vectorisé (aucune boucle Python sur les
scénarios), et **O(n)** en mémoire pour les trois vecteurs de chocs plus le
vecteur de profits. À 5 000 simulations, l'empreinte reste négligeable.

#### Hypothèses et limites

- **Les trois facteurs sont tirés indépendamment.** Aucune corrélation n'est
  introduite entre le prix du carburant et le prix du billet, alors qu'ils sont
  liés dans la réalité (un choc pétrolier durable se répercute sur les tarifs).
  Cette indépendance **élargit** artificiellement la distribution et tend donc à
  **surestimer** la probabilité de perte.
- **Lois normales symétriques.** Les prix de l'énergie sont plutôt
  asymétriques (chocs haussiers brutaux, baisse lente). Une loi log-normale
  serait plus réaliste.
- **Les écart-types sont saisis par l'utilisateur**, à 10 % par défaut, sans
  estimation à partir de l'historique. Ce ne sont pas des volatilités calibrées.
- **Le plancher à 0,1 tronque la queue gauche**, ce qui **sous-estime
  légèrement** la probabilité de perte extrême.

### 5.4 Optimisation du prix et de l'appareil — `optimize:155-259`

**Objectif** : répondre à « quel prix de billet — et quel avion — maximisent le
profit de cette liaison ? ».

**Nature de l'algorithme** : c'est une **recherche exhaustive sur grille**
(énumération discrète), et non une méthode d'optimisation continue (pas de
descente de gradient, pas de programmation linéaire, pas d'algorithme
génétique). L'espace de recherche est petit, l'énumération est donc totalement
fiable et sans risque de minimum local.

#### Étape 1 — Filtrage de la flotte candidate

```python
rows = [r for r in rows
        if r["type"] == category and (not r["range_km"] or r["range_km"] >= distance)]
```

Deux conditions :

1. **Même catégorie opérationnelle** que l'avion affecté au vol
   (`Regional`, `Narrow-body`, `Wide-body`, `Cargo`). La justification est
   donnée dans le code : la question posée est celle d'une **réaffectation** au
   sein d'une famille d'appareils, pas d'un arbitrage stratégique de flotte.
2. **Rayon d'action suffisant** : un avion incapable de parcourir la distance
   est éliminé. Nuance importante : `not r["range_km"]` signifie qu'un rayon
   **nul ou non renseigné n'exclut pas** l'appareil — choix permissif assumé.

Si le filtre vide la liste, une erreur explicite est levée.

Les vols **cargo** sont refusés en amont (`capacity <= 0`) : l'optimisation
porte sur la tarification passagers.

#### Étape 2 — Construction de la grille

```python
prix = arange(prix_min, prix_max + pas, pas)
```

Soit une suite arithmétique de prix (par défaut 500 → 8 000 MAD par pas de
100, soit **76 points**). L'espace de recherche est le **produit cartésien**
`prix × avions` : avec 76 prix et 2 avions de la même catégorie, 152
combinaisons ; avec toute la flotte, 532. Un espace aussi petit se parcourt
exhaustivement, ce qui justifie le choix de la grille.

#### Étape 3 — Modélisation de la demande

C'est le point conceptuel le plus important. La demande est une **droite
décroissante calée sur le point d'exploitation observé** du vol :

```
pente = ε × passagers_observés / prix_billet_observé        avec ε = −0,5
demande(p) = max(1 ; passagers_observés + pente × (p − prix_observé))
```

Propriétés :

- `demande(prix_observé) = passagers_observés` : la courbe **passe exactement
  par le point réel** du vol, ce qui l'ancre dans la réalité observée.
- `ε = −0,5` : élasticité-prix de la demande. Une hausse de 1 % du prix réduit
  la demande de 0,5 % — marché peu élastique, typique d'une clientèle captive.
- Le `max(1, ...)` garantit une demande strictement positive.

**Exemple** : sur AT-780 (`prix = 1 420`, `pax = 155`), la pente vaut
`−0,5 × 155/1420 ≈ −0,0546 pax/MAD`. À 1 600 MAD (soit +180 MAD), la demande
devient `155 − 0,0546 × 180 ≈ 145,2`, donc **145 passagers**.

Le commentaire du code (`decision.py:205-214`) assume et justifie explicitement
deux décisions :

- **la demande ne dépend pas de l'appareil** : c'est le marché de la liaison qui
  détermine la demande. Faire dépendre la demande de la capacité reviendrait à
  supposer qu'un gros-porteur *crée* à lui seul du trafic sur une ligne
  régionale ;
- **la forme est linéaire** et non à élasticité constante. Avec une élasticité
  constante de module inférieur à 1, le revenu serait strictement croissant avec
  le prix et l'optimum tomberait **toujours sur la borne supérieure de la
  grille** : l'optimisation ne dirait alors plus rien. La forme linéaire, elle,
  admet un maximum intérieur.

#### Étape 4 — Application de la contrainte de capacité

```
passagers(a, p) = min( capacité(a) ; floor( demande(p) ) )
```

Chaque appareil n'emporte que ce que le marché demande, **plafonné par sa
propre capacité**. C'est cette opération qui fait apparaître l'arbitrage
économique : un avion plus petit peut remplir mieux et coûter moins cher, un
avion plus grand coûte plus cher mais ne se remplit que si la demande suit.

#### Étape 5 — Évaluation vectorisée et recherche du maximum

Les coûts et le revenu sont calculés sur **toute la matrice** `(avions × prix)`
en une seule passe numpy (diffusion de tableaux), puis :

```python
meilleur_indice = np.argmax(profit, axis=1)
```

`argmax` sur l'axe des prix donne, **pour chaque avion**, le prix qui maximise
son profit. On obtient ainsi une courbe de réponse propre à chaque appareil,
plutôt qu'un seul chiffre global.

#### Étape 6 — Classement et recommandation

Les appareils sont triés par **meilleur profit décroissant** (tri stable), et le
premier devient le « gagnant » de la recommandation. Le tri stable garantit
qu'à profits strictement égaux l'ordre initial (alphabétique sur le modèle) est
préservé — résultat déterministe et donc reproductible.

#### Complexité

**O(P × A)** en temps et en mémoire, avec `P` le nombre de prix de la grille et
`A` le nombre d'avions candidats. Entièrement vectorisé. Pour les valeurs par
défaut, quelques centaines de cellules : l'exécution est immédiate.

#### Hypothèses et limites

- **L'élasticité `ε = −0,5` est codée en dur** et n'est pas calibrée sur des
  données de marché. Toute la recommandation en dépend : un marché plus élastique
  (loisirs, concurrence low-cost) plaiderait pour un `ε` plus négatif, donc un
  prix optimal plus bas.
- **La réponse est bornée par la grille.** Le prix optimal renvoyé est toujours
  l'un des points fournis par l'utilisateur. Si l'optimum réel se situe
  au-delà de `prix_max`, la recommandation se contentera de la borne, sans
  l'indiquer.
- **Le pas de la grille est une discrétisation.** Un pas de 100 MAD ne peut pas
  désigner 1 437 MAD.
- **Aucun coût d'élasticité croisée** entre les vols d'une même liaison, ni
  effet de cannibalisation, ni contrainte de concurrence.

---

## 6. Prévision — `services/forecast.py`

### 6.1 Objectif

Projeter dans le futur les tendances d'un vol ou d'un appareil à partir de
l'historique, en quantifiant **la fiabilité** de la projection.

Fonction : `linear_regression(values, horizon)`, `forecast.py:7-65`, appelée par
`run_forecast`, `forecast.py:131-184`.

### 6.2 Algorithme : régression linéaire par moindres carrés ordinaires

L'ajustement est délégué à `scipy.stats.linregress`, qui résout le problème des
**moindres carrés ordinaires** (OLS) : trouver la droite `y = a + b·x` qui
minimise la somme des carrés des écarts.

L'abscisse est l'**indice de la série** :

```
x = 0, 1, 2, … , n−1        (np.arange(n))
```

Point d'interprétation essentiel : l'axe des abscisses est le **rang du vol**,
**pas le temps calendaire**. L'horizon de « 5 » signifie donc *les 5 prochains
vols*, et non *les 5 prochaines semaines*. Le modèle suppose implicitement une
**cadence régulière** entre les observations.

### 6.3 Indicateurs de qualité produits

**Coefficient de détermination R²**

```
R² = r²
```

où `r` est le coefficient de corrélation de Pearson renvoyé par `linregress`.
Le R² mesure la part de la variance expliquée par la droite : proche de 1, la
tendance linéaire décrit bien les données ; proche de 0, les points sont
dispersés et la projection peu fiable.

**Garde-fou** : sur une série constante, `r` est indéfini (0/0). Le code teste
`np.isfinite` et force alors `R² = 0` — signaler « aucune tendance » serait
faux, mais prétendre à un bon ajustement le serait davantage.

**Test de nullité de la pente**

`linregress` fournit la **p-value** du test `H₀ : pente = 0` et l'**erreur-type**
de la pente. La p-value répond à : *cette tendance est-elle distinguable du
hasard ?* Une p-value élevée signifie qu'on ne peut pas affirmer qu'il existe
une tendance, même si la pente estimée est non nulle. Le garde-fou force
`p = 1` si la valeur n'est pas finie.

**Classification de la tendance** — un simple seuil sur la pente :

```
pente >  +0,5  →  « hausse »
pente <  −0,5  →  « baisse »
sinon          →  « stable »
```

Le seuil absolu de 0,5 est une heuristique d'affichage, sans signification
statistique : une pente de 0,6 sur une série très bruitée serait classée
« hausse » alors que sa p-value peut être élevée.

### 6.4 Intervalle de prévision à 95 %

C'est le calcul le plus soigné du module. Il s'agit d'un **intervalle de
prévision pour une observation future**, et non d'un intervalle de confiance sur
la moyenne :

```
ŷ₀ ± t(n−2 ; 0,975) × √( MSE × (1 + 1/n + (x₀ − x̄)² / Sxx) )
```

avec :

- `ŷ₀ = a + b·x₀` : la valeur prédite en `x₀` ;
- `MSE` : variance résiduelle estimée, `Σ(yᵢ − ŷᵢ)² / (n − 2)` ;
- `Sxx = Σ(xᵢ − x̄)²` : dispersion des abscisses ;
- `t(n−2 ; 0,975)` : quantile de Student à `n − 2` degrés de liberté ;
- `1/n` : incertitude sur la position de la droite ;
- `(x₀ − x̄)²/Sxx` : pénalité d'**extrapolation**.

Trois propriétés à comprendre :

1. **Le terme `+ 1`** est ce qui distingue une prévision d'une confiance. Il
   représente l'incertitude propre de la **nouvelle observation** autour de la
   droite. Un intervalle de confiance sur la moyenne ne l'aurait pas, et serait
   donc artificiellement plus étroit — et trompeur.
2. **L'intervalle s'élargit à mesure qu'on s'éloigne du centre** (`(x₀ − x̄)²`) :
   prévoir à 5 vols est bien plus incertain qu'à 1 vol. C'est correctement
   représenté, ce qui est un point de qualité notable.
3. **La loi de Student** (et non la loi normale) est utilisée tant que
   `n − 2 > 0` : c'est le choix rigoureux pour un petit échantillon. En dessous,
   le code retombe sur la loi normale.

### 6.5 Les séries projetées

`run_forecast` applique la régression à **quatre séries** :

| Série | Construction | Unité |
| --- | --- | --- |
| Taux de remplissage | `passagers / capacité × 100` | % |
| Consommation carburant | `coûts_variables × 0,6` | MAD |
| Revenu attendu | `total_revenue` | MAD |
| Profit futur | `total_revenue − total_cost` | MAD |

### 6.6 Complexité

**O(n)** par série (la régression OLS est linéaire), soit **O(4n)** au total,
avec n le nombre d'historiques.

### 6.7 Hypothèses et limites

- **La série « consommation carburant » n'est pas du carburant.**
  `forecast.py:137` définit la série comme `coûts_variables × 0,6`, soit
  **60 % de l'ensemble des coûts variables** (carburant + maintenance +
  catering + handling + taxes), puis l'intitule `« Consommation Carburant
  (MAD) »` (`forecast.py:143`). Le montant réel du carburant existe pourtant :
  il est produit par `compute_cost` dans `detail.fuel_cost`. Mais il n'est pas
  stocké en base (seuls `fixed_costs` et `variable_costs` le sont), donc la
  prévision ne peut pas le lire et recourt à cette approximation. Le rapport de
  0,6 n'est justifié par rien dans le code. **C'est le raccourci de modélisation
  le plus susceptible d'induire en erreur** : un utilisateur lira un graphique
  intitulé « consommation carburant » dont les valeurs sont une fraction
  arbitraire d'un agrégat. Une correction propre consisterait à persister une
  colonne `fuel_cost` dans `cost_results`.
- **Tendance linéaire uniquement.** Aucune saisonnalité, aucun effet de
  saturation, aucun point de rupture. Le modèle prolonge indéfiniment une
  droite, ce qui devient absurde sur un horizon long (un profit croissant à
  l'infini).
- **Abscisse = rang du vol, pas la date.** Les irrégularités de calendrier sont
  ignorées.
- **Minimum de 2 points** : en dessous, une erreur explicite et pédagogique est
  levée, qui distingue le cas général du cas particulier des avions cargo
  (`_insufficient_data_message`, `forecast.py:90-128`).
- **Aucune validation croisée** ni test de normalité des résidus.

---

## 7. Contexte de l'assistant IA — `services/app_context.py`

### 7.1 Objectif

Injecter dans le prompt système du modèle de langage un **résumé compact et
fiable de l'état réel de la base** (flotte, aéroports, vols, indicateurs,
simulations), afin que l'assistant réponde avec des chiffres exacts plutôt que
d'inventer.

Fonction : `build_app_context()`, `app_context.py:294-321`.

### 7.2 Le problème algorithmique : empaquetage sous contrainte

Il s'agit d'un **problème d'empaquetage sous contrainte de budget** :

- un budget total de **15 000 caractères** (`BUDGET_CARACTERES`,
  `app_context.py:25`, soit environ 3 000 jetons) ;
- une liste d'éléments (sections) de tailles variables ;
- il faut choisir ce qu'on garde.

Le problème général (sac à dos) est NP-difficile. Ici, il est résolu par une
**heuristique gloutonne** en deux temps, qui exploite le fait que les sections
de synthèse sont courtes et indispensables.

**Temps 1 — les synthèses d'abord, sans condition.** Les sections `GUIDE`,
`FLOTTE`, `AÉROPORTS`, `INDICATEURS`, `CLASSEMENTS`, `PAR AVION`,
`SIMULATIONS` et `COMPTES` sont toujours incluses. Leur taille cumulée est
mesurée, puis retranchée du budget.

**Temps 2 — les vols, avec le budget restant.** La liste détaillée des vols est
empaquetée gloutonnement :

1. les vols sont **groupés par modèle d'avion** (dictionnaire) ;
2. les groupes sont **triés par nombre de vols décroissant** — les avions les
   plus utilisés passent en premier, c'est un critère de valeur ;
3. un groupe n'est inclus que si **tous ses vols tiennent intégralement** dans
   le budget restant (test `si taille + longueur > budget`), et l'espace alors
   consommé est déduit ;
4. les groupes écartés sont **listés explicitement**.

La règle « tout ou rien » du point 3 n'est pas un détail : elle garantit que le
nombre de vols annoncé dans l'en-tête d'un groupe **correspond toujours aux
lignes effectivement présentes**. Un découpage partiel produirait un résumé
incohérent, et un modèle de langage peut difficilement détecter ce genre de
contradiction interne.

### 7.3 Le principe « calculer plutôt que faire lire »

Le module applique systématiquement une règle de conception : **les chiffres
agrégés sont précalculés et fournis explicitement au modèle**.

- `_extreme` (`app_context.py:181-187`) exécute `ORDER BY … LIMIT 1` pour
  trouver la pire et la meilleure marge.
- `_par_avion` (`app_context.py:223-242`) calcule explicitement le minimum et le
  maximum de marge moyenne par appareil.
- `_indicateurs` fournit comptages, moyennes, cumuls et extrêmes.

Le raisonnement est documenté dans le code : un modèle de langage **compare mal
des centaines de lignes** et se trompe quand il doit déduire un comptage ou un
classement d'une longue liste. En revanche, il restitue correctement un chiffre
déjà calculé. La liste des vols n'est donc fournie que pour **retrouver un vol
précis**, ce que confirme le prompt lui-même
(`routers/chatbot.py:45-48`).

### 7.4 Optimisation du cache de prompt

Détail d'ingénierie notable : l'horodatage est volontairement **tronqué à la
journée, sans heure** (`app_context.py:12-15`). Le prompt système reste donc
**identique d'une question à l'autre dans la même journée**, ce qui permet à
Ollama de **réutiliser son cache de prompt** au lieu de recalculer tout le
contexte. Le gain est direct sur la latence du premier jeton.

### 7.5 Complexité

**O(N)** pour le parcours des vols, **O(G log G)** pour le tri des G groupes
d'appareils, **O(N)** en mémoire pour le texte produit, plafonné par
construction à environ 15 000 caractères.

### 7.6 Hypothèses et limites

- **Heuristique gloutonne, non optimale.** Un choix optimal du sous-ensemble de
  vols pourrait faire tenir davantage de lignes utiles. L'écart est sans
  importance ici, la valeur d'un groupe étant approximativement proportionnelle
  à sa taille.
- **Le budget est exprimé en caractères, la contrainte réelle en jetons.** Le
  rapport caractères/jetons est d'environ 5 pour du texte français, mais il
  varie selon le contenu (chiffres et codes IATA coûtent davantage de jetons
  par caractère). La marge prise (15 000 caractères pour une fenêtre de
  10 240 jetons) absorbe cette variabilité.
- **Sensibilité à l'ordre des sections.** Les synthèses étant servies en premier,
  une base très volumineuse peut voir la liste des vols réduite à presque rien.
  Le comportement reste explicite, puisqu'un message signale les avions non
  détaillés.

---

## 8. Sécurité et authentification — `security.py`

### 8.1 Objectif

Protéger l'accès à l'API et aux données, sans jamais stocker un mot de passe en
clair.

### 8.2 Hachage des mots de passe

**Algorithme actif : bcrypt** (`security.py:19-21`).

```python
bcrypt.hashpw(password.encode(), bcrypt.gensalt())
```

bcrypt est une fonction de dérivation **volontairement lente** et **salée**.
Deux propriétés essentielles :

- le **coût calculatoire** est paramétrable et élevé, ce qui rend une attaque
  par force brute ou par dictionnaire très coûteuse, contrairement à un simple
  hachage rapide ;
- le **sel** (généré aléatoirement par `gensalt`) est intégré au hachage
  stocké, donc deux mots de passe identiques produisent deux empreintes
  différentes — ce qui rend inopérantes les tables de correspondance
  pré-calculées (*rainbow tables*).

**Compatibilité et migration silencieuse.** Un ancien hachage **SHA-256 sans
sel** est encore accepté (`_sha256_legacy_hash`, `security.py:24-25`), puis
détecté comme obsolète :

```python
def needs_rehash(hashed): return not hashed.startswith("$2")
```

Le préfixe `$2` identifie un hachage bcrypt. À la connexion suivante, un
hachage hérité est **recalculé en bcrypt et réécrit en base** : la base migre
d'elle-même, sans interruption de service ni réinitialisation de mot de passe.
C'est un schéma classique de migration de hachage, correctement implémenté.

### 8.3 Comparaison à temps constant

```python
hmac.compare_digest(_sha256_legacy_hash(password), hashed)
```

Pour le chemin hérité, la comparaison passe par `hmac.compare_digest`, qui
compare en **temps constant**, c'est-à-dire sans s'arrêter au premier caractère
divergent. L'objectif est d'empêcher une **attaque temporelle** : une
comparaison naïve (`==`) s'interrompt dès la première différence, et la mesure
du temps de réponse permet de reconstituer l'empreinte caractère par caractère.

La branche bcrypt n'en a pas besoin : `bcrypt.checkpw` est conçu pour cela.

### 8.4 Jetons JWT

```python
payload = { "sub": id, "username": ..., "role": ..., "iat": ..., "exp": ... }
jwt.encode(payload, SECRET_KEY, algorithm="HS256")
```

- **Algorithme : HS256** (`config.py:26`) — HMAC-SHA256, signature symétrique
  avec une clé partagée. Suffisant pour un service unique qui émet et vérifie
  ses propres jetons, mais il implique que quiconque détient la clé peut forger
  un jeton.
- **Revendications** : `sub` (identifiant), `username`, `role` (utilisé pour le
  contrôle d'accès), `iat` (émission), `exp` (expiration, 720 minutes par défaut
  via `RAM_TOKEN_EXPIRE`).
- **La clé secrète n'a pas de valeur par défaut** : `config.py:19-24` lève une
  exception au démarrage si `RAM_SECRET_KEY` est absente. Le backend refuse donc
  de démarrer en configuration non sécurisée, ce qui évite le grand classique du
  secret par défaut oublié en production.

### 8.5 Complexité

Coût de bcrypt **volontairement élevé** (paramétrable, de l'ordre de plusieurs
dizaines de millisecondes) : c'est une propriété recherchée, pas une faiblesse.
JWT HS256 : **O(taille du jeton)**.

---

## 9. Import Excel — `routers/flights.py`

### 9.1 Objectif

Créer un vol à partir d'un fichier `.xlsx` rempli par un analyste, en refusant
les données incohérentes **avant** toute écriture en base.

### 9.2 Analyse du fichier — `_read_excel_bytes:185-202`

L'algorithme d'analyse repose sur une **convention de mise en page** :

1. ouverture du classeur en `data_only=True` (valeurs calculées, pas les
   formules) ;
2. sélection de la feuille `« Vol »` si elle existe, sinon la feuille active ;
3. parcours des lignes à partir de la **deuxième** (la première étant l'en-tête),
   et lecture d'un **couple clé/valeur** : colonne 1 = libellé du champ,
   colonne 2 = valeur ;
4. écart des lignes vides ou dont le libellé commence par `---` (séparateurs
   visuels).

Le résultat est un **dictionnaire `libellé → valeur`**. Le choix d'un format
clé/valeur plutôt que positionnel rend le fichier tolérant aux réordonnancements
et lisible par un humain.

### 9.3 Validation en pipeline — `_validate_excel:205-260`

Les contrôles s'enchaînent, chacun pouvant ajouter un message à une **liste
d'erreurs** — toutes les anomalies sont donc signalées **en une seule fois**, au
lieu d'obliger l'utilisateur à corriger le fichier erreur par erreur.

| Étape | Contrôle | Règle |
| --- | --- | --- |
| 1 | Champs obligatoires | Le champ existe et n'est pas vide |
| 2 | Champs numériques | Conversion `virgule → point` possible, puis `valeur > 0` |
| 3 | Clé étrangère avion | `ID Avion` convertible en entier **et** présent dans la table `aircraft` |
| 4 | Clés étrangères aéroports | Les codes IATA de départ et d'arrivée existent dans `airports` |

L'étape 2 mérite une remarque : la **normalisation de la virgule décimale en
point** traite élégamment le cas d'un Excel configuré en locale française, qui
produit `2,95` là où Python attend `2.95`. Sans cette conversion, tous les
fichiers français seraient rejetés.

Les étapes 3 et 4 implémentent une **vérification d'intégrité référentielle**
applicative, en amont du `FOREIGN KEY` de PostgreSQL. L'intérêt est le **message
d'erreur** : « ID Avion 12 introuvable dans la base de données » est actionnable,
alors que la violation de contrainte brute ne le serait pas.

### 9.4 Complexité

**O(R)** pour R lignes du fichier, plus une requête d'existence par référence
vérifiée (nombre constant).

### 9.5 Limites

- Une seule feuille et un format clé/valeur imposé : un fichier au format
  tabulaire classique n'est pas reconnu.
- Aucune transaction couvrant l'analyse puis l'insertion (l'analyse est
  antérieure à l'ouverture de la connexion) : sans conséquence pratique ici,
  aucun autre écrit n'ayant lieu entre les deux.
- Le vol créé n'est **pas calculé automatiquement** : il faut ensuite lancer le
  calcul de coût.

---

## 10. Génération des données de démonstration — `seed_data.py`

### 10.1 Objectif et propriété clé

Peupler la base d'un jeu de données réaliste pour la démonstration.

**Propriété essentielle : la génération est entièrement déterministe.** Elle
n'utilise **aucun tirage aléatoire** — pas de `random`, pas de numpy. C'est une
décision structurante : elle garantit que les réponses du chatbot sont
**stables et testables**, ce dont dépend directement le script de vérification
(section 12.3).

### 10.2 Générateur de séries — `_weeks:118-127`

```python
def _weeks(start_pax, step_pax, start_fuel, step_fuel, start_price, step_price, n):
    return [{"pax":   round(start_pax   + step_pax   * i),
             "fuel":  round(start_fuel  + step_fuel  * i, 2),
             "price": round(start_price + step_price * i)}
            for i in range(n)]
```

C'est un générateur de **suites arithmétiques** : chaque route est décrite par un
point de départ et une pente, semaine par semaine. Le paramètre `step` peut être
**négatif**, ce qui permet de modéliser une route en déclin (`step_pax = -3`
signifie « 3 passagers de moins par semaine »).

Cette paramétrisation est ce qui donne au jeu de données sa **lisibilité
analytique** : chaque route porte une tendance explicite (croissance, déclin,
stabilité), et la régression de l'onglet Prévision doit la retrouver. La
démonstration est donc cohérente de bout en bout.

### 10.3 Date de vol — `_flight_date:371-378`

```python
base = datetime.date(2026, 1, 4)
return (base + datetime.timedelta(weeks=week_index)).isoformat()
```

Les vols sont répartis **une fois par semaine** à partir d'une date fixe. La
distribution est donc régulière, ce qui — comme noté en section 6.7 —
**correspond exactement à l'hypothèse de cadence régulière** de la régression
linéaire. La cohérence est volontaire.

### 10.4 Flotte et routes

`DEMO_AIRCRAFT` (`seed_data.py:48-56`) définit sept appareils répartis en quatre
catégories opérationnelles (`Regional`, `Narrow-body`, `Wide-body`, `Cargo`),
avec leurs coûts horaires et leur rayon d'action. Ces catégories sont
précisément celles qu'utilise le filtre de l'optimiseur (section 5.4).
Les distances sont des constantes **relevées manuellement** (sources citées en
`seed_data.py:18-22`).

### 10.5 Complexité

**O(R × n)**, avec R routes et n semaines par route — construction en mémoire
puis insertion.

---

## 11. Tri côté frontend — `lib/useSort.ts`

### 11.1 Objectif

Trier les tableaux de l'interface au clic sur un en-tête de colonne.

### 11.2 Algorithme : comparateur générique à branchements par type

Le hook construit un comparateur qui traite successivement plusieurs cas
(`useSort.ts:23-36`) :

1. **Valeurs absentes (`null` / `undefined`) toujours en dernier**, quel que
   soit le sens du tri. C'est une règle d'ergonomie : les lignes incomplètes ne
   doivent pas envahir le haut du tableau selon l'orientation choisie.
2. **Nombres** : soustraction `(a − b) × sens`.
3. **Dates** : soustraction des timestamps.
4. **Chaînes** : `localeCompare(..., "fr", { numeric: true, sensitivity: "base" })`.

Le point notable est l'option **`numeric: true`**, qui réalise un **tri naturel**.
Sans elle, l'ordre lexicographique classerait `AT-10` avant `AT-9`. Avec elle,
les segments numériques sont comparés comme des nombres. L'option
`sensitivity: "base"` rend en outre le tri **insensible à la casse et aux
accents**, ce qui est le comportement attendu pour du texte français.

Le tri est appliqué sur une **copie** (`[...rows]`), et non sur le tableau
d'origine : les données sources ne sont jamais mutées — exigence importante en
React, où une mutation du state provoquerait des rendus incohérents.

### 11.3 Complexité

**O(n log n)** par rendu, recalculé uniquement lorsque `rows`, `sortKey` ou
`sortDir` changent (mémoïsation par `useMemo`).

### 11.4 Absence de calcul métier

Cette section clôt la partie frontend : **aucun autre traitement algorithmique
n'y figure**. Les seules autres opérations sont des agrégats triviaux
d'affichage — `reduce` pour la capacité maximale de la flotte
(`AircraftPage.tsx:177`), somme des redevances d'atterrissage
(`AirportsPage.tsx:145`), comptage des types distincts par `Set` — ainsi que la
décomposition du corps d'un JWT pour vérifier l'expiration
(`lib/auth.tsx:90-92`).

---

## 12. Scripts de mesure et de vérification

Ces trois scripts ne font pas partie de l'application : ils constituent son
**outillage de mesure**. Ils implémentent une méthodologie de banc d'essai.

### 12.1 `benchmark_models.py` — comparaison de modèles

- **Chaîne de mesure complète** : déchargement du modèle, mesure du chargement à
  froid, puis des réponses à chaud, avec `num_ctx` variable.
- **Statistiques par médiane** (`statistics.median`) et non par moyenne : la
  médiane est **robuste aux valeurs aberrantes**, ce qui est indispensable pour
  une latence, où un pic isolé fausserait une moyenne.
- **Détection des faux positifs** : la fonction `evaluer` (`benchmark_models.py:98-108`)
  ancre les motifs sur des **limites numériques**, afin qu'un contrôle `"44"` ne
  soit pas satisfait par `"1 344"` ni par `"440"`. Le commentaire du code explique
  l'enjeu : sans cette précaution, un contexte riche en chiffres (distances,
  montants, capacités) produirait des correspondances parasites et donc des
  **scores gonflés** — exactement ce qu'un banc d'essai doit éviter.
- **Relevé du débordement CPU/GPU** via la colonne `PROCESSOR` de `ollama ps`.

### 12.2 `profile_chatbot.py` — profilage de latence

- **Décomposition de la latence** : temps de chargement, latence du premier
  jeton, débit de génération, durée murale.
- **Débit** : `eval_count / eval_duration`, calculé à partir des compteurs natifs
  d'Ollama plutôt qu'estimé.
- **Exécution concurrente** (`ThreadPoolExecutor`) pour mesurer le comportement
  sous charge parallèle.
- **Lecture de la configuration réelle** : le script interroge les variables
  d'environnement du conteneur, car Docker Compose peut surcharger `OLLAMA_MODEL`
  et le script mesurerait alors un autre modèle que celui réellement servi.

### 12.3 `verify_chatbot_data.py` — vérification de contenu

Contrôle **fonctionnel** (par opposition au contrôle de performance ci-dessus) :
il pose des questions dont la réponse exacte est connue dans la base de
démonstration et compare la réponse du modèle. Il teste aussi une
**conversation suivie**, afin de vérifier que l'accumulation de l'historique ne
fait pas déborder la fenêtre de contexte.

---

## 13. Synthèse des hypothèses et points d'attention

Cette section rassemble les constats issus de l'audit. Ils sont classés en deux
catégories, car leur nature diffère : les **défauts probables**, qui appellent
une correction, et les **compromis assumés**, qui appellent seulement d'être
connus.

### 13.1 Défauts probables

**a) Réponses de référence périmées dans le script de vérification.**
`scripts/verify_chatbot_data.py:28-38` attend `« 178 vols enregistres, 94
deficitaires »` et une marge de `-79,6 %` pour AT-866. Or
`docs/todo-agent-rtx.md:15-18` documente un **recalibrage du jeu de données, passé
de 178 à 185 vols**, avec des marges modifiées. Le script signalera donc des
échecs qui ne correspondent à aucune régression réelle. C'est le point le plus
concret à corriger : un test dont les attentes sont fausses perd toute valeur.

**b) Décalage d'une unité sur le seuil de rentabilité.**
`cost.py:31` (et à l'identique `cost.py:169`) calcule
`int(fixe / marge_unitaire) + 1`. Quand la division tombe **exactement** sur un
entier, le `+ 1` ajoute un passager de trop : pour `fixe / marge = 10,0`, la
formule renvoie 11 là où un plafond rigoureux (`math.ceil`) renverrait 10. Le
biais est d'un seul passager et ne se produit que dans le cas d'une division
exacte, mais il est systématique dans ce cas.

**c) La série « consommation carburant » n'est pas du carburant.**
Voir section 6.7 : `forecast.py:137` utilise `coûts_variables × 0,6` sous un
libellé `« Consommation Carburant (MAD) »`. Le ratio 0,6 n'est justifié nulle
part, et la valeur affichée est une fraction arbitraire d'un agrégat. La
correction propre consiste à persister `detail.fuel_cost` dans une colonne de
`cost_results`, puis à lire cette colonne.

### 13.2 Compromis assumés — à connaître, pas à corriger

**d) « Marge (%) » désigne un rendement sur coût, non une marge commerciale.**
`(revenu − coût) / coût` est un **markup** (rendement des coûts). La marge
commerciale usuelle se calcule sur le **revenu**. La convention est appliquée
systématiquement dans toute l'application, donc les **comparaisons entre vols
restent valides** ; c'est l'interprétation absolue du chiffre qui doit être
précise. Un vol affiché « +1,26 % » ne marge pas à 1,26 % de son prix, mais
génère 1,26 % de retour sur ce qu'il coûte.

**e) L'abscisse de la prévision est le rang du vol, non la date.**
Voir section 6.3. L'« horizon 5 » désigne les 5 prochains vols. Avec des données
hebdomadaires régulières, les deux lectures coïncident — ce qui masque le
problème en démonstration, mais ne le supprime pas si la cadence devient
irrégulière.

**f) Le BELF est une approximation.** Voir section 5.1 : `CASK/RASK` n'égale le
seuil de rentabilité en remplissage que si les coûts sont indépendants du
remplissage, ce qui n'est pas le cas ici.

**g) L'élasticité de la demande est figée à −0,5 et la demande est linéaire.**
Voir section 5.4. Le choix est explicitement justifié dans le code (une
élasticité constante de module < 1 enverrait l'optimum sur la borne haute de la
grille). C'est donc un compromis raisonné, mais l'élasticité n'est pas calibrée
sur des données, et le résultat reste borné par la grille fournie par
l'utilisateur.

**h) La graine du Monte Carlo est fixée à 42.** Voir section 5.3. Les résultats
sont reproductibles ; relancer n'apporte aucune information nouvelle, seule
l'augmentation de `n` resserre l'estimation.

**i) Les facteurs simulés sont indépendants.** Voir section 5.3 : l'absence de
corrélation entre carburant et prix du billet **élargit** la distribution et
tend à surestimer la probabilité de perte.

### 13.3 Absences confirmées

Pour mémoire, ces éléments ont été recherchés et **n'existent pas** dans le
dépôt (détail en section 1.2) : calcul de distance géodésique (la distance est
saisie), logique algorithmique en base (aucun trigger, vue ou fonction stockée),
calcul métier côté client, et apprentissage automatique.

---

## 14. Récapitulatif des complexités

Notations : `N` nombre de vols, `A` nombre d'avions, `P` points de la grille de
prix, `S` nombre de simulations, `B` classes d'histogramme, `R` lignes de
fichier Excel, `G` groupes d'appareils, `n` points d'une série.

| Algorithme | Fichier | Complexité | Nature |
| --- | --- | --- | --- |
| Modèle de coût | `services/cost.py:4` | O(1) | Arithmétique linéaire |
| Simulation de scénario | `services/cost.py:140` | O(1) | Sensibilité déterministe |
| Agrégats du tableau de bord | `services/cost.py:250` | O(N log N) | SQL délégué |
| KPI aéronautiques | `services/decision.py:8` | O(1) | Ratios normalisés |
| Histogramme | `services/decision.py:52` | O(S + B) | Discrétisation |
| Monte Carlo | `services/decision.py:70` | O(S) vectorisé | Simulation stochastique |
| Optimisation prix/flotte | `services/decision.py:155` | O(P × A) | Recherche exhaustive |
| Régression linéaire + IP 95 % | `services/forecast.py:7` | O(n) | Moindres carrés ordinaires |
| Empaquetage du contexte IA | `services/app_context.py:294` | O(N + G log G) | Heuristique gloutonne |
| Hachage bcrypt | `security.py:19` | Coût volontairement élevé | Dérivation de clé |
| JWT HS256 | `security.py:45` | O(taille du jeton) | Signature HMAC |
| Analyse Excel | `routers/flights.py:185` | O(R) | Analyse clé/valeur |
| Validation Excel | `routers/flights.py:205` | O(R) | Pipeline de contrôles |
| Génération de démo | `seed_data.py:118` | O(R × n) | Suites arithmétiques |
| Tri des tableaux | `lib/useSort.ts:23` | O(n log n) | Comparateur typé |

---

*Document technique — RAM Flight Cost Calculator v2.0.*
