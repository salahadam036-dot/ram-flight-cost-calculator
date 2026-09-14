# Vols

## Objectif

Le cœur de l'application : **créer et gérer les vols**, puis **calculer leur coût**
et leur rentabilité.

## Ce que l'on y trouve

- La liste des vols avec leur numéro, leurs aéroports de départ et d'arrivée,
  l'avion utilisé, le nombre de passagers, et (une fois calculé) leur coût total,
  revenu, marge et statut rentable/déficitaire.
- L'ajout, la modification et la suppression de vols.
- L'import d'un vol depuis un fichier **Excel**.

## Le calcul de coût

Pour chaque vol, le système distingue :

- **Coûts fixes** : amortissement de l'avion, équipage, assurance.
- **Coûts variables** : carburant, maintenance, restauration, handling, taxes.

Il en déduit le coût total, le revenu (prix du billet × passagers), le coût par
passager, le seuil de rentabilité (nombre de passagers nécessaires pour couvrir les
coûts) et la marge.

> **Note sur les vols cargo** : les vols dont le nombre de passagers est nul
> (ex. vol cargo `AT-701`) sont volontairement exclus du calcul de coût et, par
> conséquent, n'apparaissent ni dans le tableau de bord ni dans la prévision
> (ces écrans se basent sur les résultats de coût `cost_results`).

## À quoi cela sert

Saisir ou importer les données d'un vol et obtenir immédiatement sa rentabilité.
C'est la brique de base alimentant tous les autres onglets (scénarios,
prévision, risque).
