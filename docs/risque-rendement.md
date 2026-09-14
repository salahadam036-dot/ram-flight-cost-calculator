# Risque & Rendement

## Objectif

Analyser finement un vol du point de vue du **risque** (probabilité de perte) et
du **rendement** (optimisation du prix), à l'aide d'indicateurs aéronautiques
avancés.

Cet onglet est présenté en deux colonnes : à gauche les **contrôles** (choix du vol
et réglages), à droite les **résultats** (graphiques et tableaux). Des encadrés
explicatifs (« De quoi s'agit-il ? ») sont repliables pour guider les débutants.

Il regroupe trois outils complémentaires, accessibles par sous-onglets :

### 1. Indicateurs aéronautiques

Calcule les KPI standards d'une compagnie aérienne : ASK (sièges × distance),
RPK (passagers × distance), taux de remplissage, RASK (revenu par ASK), CASK (coût
par ASK), yield (revenu par passager-km) et BELF (seuil de rentabilité).

### 2. Analyse de risque (Monte Carlo)

Simule 5000 scénarios en faisant varier aléatoirement le prix du carburant, le
nombre de passagers et le prix du billet (écart-type réglable pour chacun de ces
trois facteurs). Affiche le profit moyen, la **probabilité de perte**, la
**VaR 95 %**, l'intervalle de confiance, un verdict de risque et un histogramme
de distribution des profits. Le tirage aléatoire est **reproductible** (graine
fixée à `42`).

### 3. Optimisation & recommandation

Cherche le **prix de billet optimal** (et l'avion le mieux adapté) qui maximise le
profit, en tenant compte de l'élasticité de la demande au prix. Propose une
recommandation automatique avec le prix, le nombre de passagers et le profit
attendus.

## À quoi cela sert

Dépasser le simple calcul de coût pour quantifier l'incertitude et optimiser la
tarification d'un vol avant de le commercialiser.

## Données requises

Les trois outils s'appuient sur un vol dont le coût a déjà été **calculé**
(onglet Vols). Les vols cargo (0 passager) sont **exclus** de l'onglet : ils
n'apparaissent pas dans le sélecteur de vol.
