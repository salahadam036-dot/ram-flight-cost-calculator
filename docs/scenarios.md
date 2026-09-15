# Scénarios (Laboratoire de simulation)

## Objectif

Simuler l'impact de **variations économiques** sur la rentabilité d'un vol
(analyse « what-if » déterministe), avec des scénarios prédéfinis prêts à l'emploi.

## Ce que l'on y trouve

- Le choix du vol à simuler (avec son contexte : avion, passagers, marge de base).
- **Sept scénarios prédéfinis** cliquables (voir ci-dessous).
- **Quatre leviers** ajustables manuellement :
  - **Prix du carburant** (variation en %).
  - **Taux de remplissage** (variation en points).
  - **Prix du billet** (variation en %).
  - **Taxe additionnelle** (montant fixe en MAD).
- Un comparatif **Base vs Simulé** : coût, revenu, marge, passagers, prix — avec la
  variation en pourcentage et un graphique en barres.
- Un **historique des simulations** cliquable (recharger un scénario passé, le
  supprimer, avec mini-graphique de tendance des marges).

## Scénarios prédéfinis

| Nom | Effet |
| --- | --- |
| Krach du carburant | Carburant −40 % |
| Choc pétrolier | Carburant +50 % |
| Pic de demande | Remplissage +30 pts, billet +15 % |
| Sous-remplissage | Remplissage −40 points |
| Guerre des prix | Billet −25 %, remplissage +5 pts |
| Nouvelle taxe | +15 000 MAD de taxes |
| Crise globale | Carburant +30 %, remplissage −25 pts, billet −10 %, taxe +5 000 MAD |

## Comment cela fonctionne

Le moteur repart du coût réel du vol, applique les variations demandées (nouveau
prix du carburant, nouveau nombre de passagers, nouveau prix du billet, taxe
supplémentaire), puis recalcule coût, revenu, marge, profit et seuil de rentabilité.

Le nom du scénario est **généré automatiquement** : soit le nom du preset, soit une
description des leviers (ex. « Carb +50% · Rempl -25% »).

> Les résultats d'une simulation ne modifient **jamais** le vol réel : c'est un
> environnement exploratoire. Les vols cargo (0 passager) sont exclus de l'outil.

## À quoi cela sert

Répondre à des questions concrètes : « que se passe-t-il si le kérosène augmente de
20 % ? », « et si le tarif baisse face à un low-cost ? ». Utile pour tester la
robustesse d'un vol avant une décision.
