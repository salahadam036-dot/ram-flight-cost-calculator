# Aéroports

## Objectif

Gérer le **catalogue des aéroports** (codes IATA) et leurs redevances
d'atterrissage. Ces données alimentent les listes de sélection des vols et la
validation de l'import Excel.

## Ce que l'on y trouve

- La liste des aéroports avec leur code IATA, leur nom, leur ville, leur pays et
  leur redevance d'atterrissage.
- L'ajout, la modification et la suppression d'aéroports.

## Les données saisies par aéroport

- **Code IATA** (3 lettres, ex: `CMN`) — identifiant unique, non modifiable une
  fois créé.
- **Nom** (ex: `Mohammed V`).
- **Ville** (ex: `Casablanca`).
- **Pays** (ex: `Maroc`).
- **Redevance d'atterrissage** (MAD).

## À quoi cela sert

- Alimenter les listes déroulantes **Départ / Arrivée** lors de la création d'un
  vol.
- Valider que les codes IATA d'un **import Excel** existent réellement.
- Centraliser la redevance d'atterrissage en tant que donnée de référence.

## Lien avec les vols

Les codes IATA sont reliés aux vols par **clé étrangère** :

- `flights.departure_airport → airports.code`
- `flights.arrival_airport → airports.code`

Conséquences :

- Un vol ne peut être créé (ou importé) qu'avec des codes IATA existants.
- Un aéroport **référencé par au moins un vol ne peut pas être supprimé** (la
  suppression échoue avec une erreur de clé étrangère) tant que ses vols n'ont
  pas été supprimés ou réaffectés.

> **Note** : le code IATA sert de clé (et non un identifiant numérique). Il est
> exigé au format 3 lettres majuscules. Un code ne peut pas être modifié : pour le
> corriger, supprimez puis recréez l'aéroport.
