# Flotte

## Objectif

Gérer les **caractéristiques techniques et économiques** des avions de la flotte.

## Ce que l'on y trouve

- La liste des appareils avec leur type (`Narrow-body`, `Wide-body`, `Regional`,
  `Cargo`), leur modèle, leur capacité et leurs coûts opérationnels.
- L'ajout, la modification et la suppression d'avions.

## Les données saisies par avion

- **Capacité** (nombre de sièges).
- **Consommation de carburant** (litres par heure).
- **Coût de maintenance** par vol.
- **Coût d'amortissement** par vol.
- **Coût d'équipage** par vol.
- **Coût d'assurance** par vol.

## À quoi cela sert

Ces données sont des **données de référence** : elles alimentent le calcul de coût
de chaque vol. Elles ne changent pas à chaque vol, mais définissent le coût
structurel de chaque appareil.
