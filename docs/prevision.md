# Prévision

## Objectif

Projeter les **tendances futures** de rentabilité à partir de l'historique des
vols, grâce à une régression linéaire.

## Ce que l'on y trouve

- Le choix d'un avion (ou « tous les avions »).
- Une projection automatique sur les **5 prochains vols** (horizon fixe, sans
  réglage manuel).
- Pour chaque indicateur (taux de remplissage, consommation de carburant, revenu,
  profit) :
  - la valeur projetée au vol N+1,
  - la variation par rapport au dernier vol,
  - la tendance (hausse, baisse, stable) et le coefficient R²,
  - un graphique de l'historique, de la régression et de la prévision.
- Un tableau récapitulatif des prévisions.

## Comment cela fonctionne

Une **régression linéaire par moindres carrés** (`scipy.stats.linregress`) est
ajustée sur **tous** les vols historiques de l'appareil sélectionné, puis
prolongée automatiquement sur les prochains vols (horizon fixe de 5 vols).

## À quoi cela sert

Anticiper l'évolution du remplissage ou du profit d'un appareil, pour planifier
l'offre (ajout/retrait de fréquences, ajustement de capacité) sur les prochains vols.
