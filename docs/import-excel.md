# Import Excel

L'onglet **Vols** permet d'importer un vol depuis un fichier Excel (`.xlsx`).
Un modèle prêt à l'emploi est fourni à la racine du projet : `modele_vol.xlsx`.

## Format du fichier

Le fichier contient une feuille nommée **`Vol`** (ou, à défaut, la première feuille)
avec deux colonnes :

- **Colonne A** : le **nom du champ** (ne pas modifier).
- **Colonne B** : la **valeur**.

### Champs obligatoires

| Champ | Format | Exemple |
| --- | --- | --- |
| `Numero de vol` | texte | `AT-500` |
| `Aeroport depart` | code IATA | `CMN` |
| `Aeroport arrivee` | code IATA | `CDG` |
| `Distance (km)` | nombre > 0 | `2200` |
| `Duree (heures)` | nombre décimal | `3.5` |
| `Nombre de passagers` | entier > 0 | `160` |
| `Prix carburant (MAD/L)` | nombre > 0 | `9.5` |
| `Prix billet moyen (MAD)` | nombre > 0 | `2500` |
| `ID Avion` | entier (voir table ci-dessous) | `1` |

### Champs optionnels

| Champ | Valeur par défaut si absent |
| --- | --- |
| `Catering par passager (MAD)` | `25` |
| `Handling (MAD)` | `500` |
| `Taxes aeroportuaires (MAD)` | `0` |
| `Date du vol` | `null` |

## Correspondance `ID Avion`

> ⚠️ L'identifiant `ID Avion` correspond à la **clé primaire** de l'avion dans la
> base (`aircraft.id`), pas à un numéro d'ordre fixe. Les avions de démonstration
> sont insérés dans cet ordre au premier démarrage :

| ID Avion | Modèle |
| --- | --- |
| 1 | Boeing 737-800 |
| 2 | Boeing 737 MAX 8 |
| 3 | Boeing 787-8 |
| 4 | Boeing 787-9 |
| 5 | ATR 72-600 |
| 6 | Embraer E190 |
| 7 | Boeing 767-300F |

Pour connaître l'identifiant réel d'un avion, consultez l'onglet **Flotte** (ou la
route `GET /api/flights` qui renvoie `aircraft_id`). Si vous ajoutez ou supprimez
des avions, ces identifiants peuvent changer.

## Validation

À l'import, le backend vérifie :

- la présence de tous les champs obligatoires ;
- que les champs numériques sont des valeurs > 0 ;
- que `ID Avion` existe dans la base.

En cas d'erreur, un message explicite (champ manquant / valeur invalide) est
renvoyé et le vol n'est pas importé.
