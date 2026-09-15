"""Données de démonstration calibrées pour l'application RAM.

Ce module génère un jeu de données complet et varié, couvrant plusieurs
scénarios métier (bon, moyen, mauvais, très mauvais) afin que les tableaux de
bord, les graphiques de prévision et les analyses de risque soient peuplés avec
des tendances crédibles.

Trois principes de construction :

1. **Déterminisme** — aucun aléa : le même appel produit toujours les mêmes vols,
   ce qui rend l'application reproductible et testable.
2. **Réalisme opérationnel** — distances, temps de vol bloc, appareils affectés
   et redevances sont issus de données publiques (voir ci-dessous).
3. **Calibration économique** — les cadences de coûts sont calibrées sur les
   benchmarks sectoriels IATA et Airlines for America, de sorte que le coût par
   heure de vol et le CASK (coût par siège-kilomètre offert) des appareils
   restent dans les plages publiées par le secteur.

Sources des paramètres :
  - Distances : distances orthodromiques entre aéroports (Air Miles Calculator,
    table « Casablanca Mohammed V »).
  - Temps de vol bloc : horaires publiés Royal Air Maroc (Kayak/compagnie).
  - Affectation des appareils : composition réelle de la flotte RAM 2025-2026
    (28 x 737-800, 13 à 18 x 737 MAX 8, 5 x 787-8, 6 x 787-9, 4 x Embraer E190,
    6 x ATR 72-600) — les 787 sont réservés aux liaisons long-courriers.
  - Cadences avions : IATA Airline Cost Management Group (coût d'exploitation
    par heure de vol) et IATA Maintenance Cost data eXchange FY2024
    (1 522 USD par heure de vol de maintenance, 3 758 USD par cycle).
  - Assistance en escale : fourchette de marché 2 500 à 8 500 USD par rotation
    (aéroports secondaires de marchés émergents situés en bas de fourchette).
  - Restauration : coût par passager selon la classe de distance.
"""

# ── Avions ─────────────────────────────────────────────────────────────────
# (type, model, capacity, carburant L/h, maintenance MAD/h, amortissement MAD/h,
#  equipage MAD/h, assurance MAD/h, rayon d'action km)
#
# IMPORTANT — tous les postes d'exploitation de l'appareil sont exprimés PAR
# HEURE DE VOL, et non par vol : le coût d'un vol dépend de sa durée. Un vol de
# 8 heures immobilise l'appareil, l'équipage et les charges de possession huit
# fois plus longtemps qu'un vol d'une heure. C'est cette indexation qui rend le
# modèle cohérent entre un courrier long (CMN-JFK) et une navette (CMN-RAK).
#
# Calibration : la somme (maintenance + amortissement + équipage + assurance)
# + carburant x prix produit un coût par heure de vol conforme, à moins de 1,5 %,
# aux coûts d'exploitation par heure de vol publiés par l'IATA pour chaque type
# d'appareil, ramenés à un prix du carburant de 155 USD/baril.
DEMO_AIRCRAFT = [
    ("Narrow-body", "Boeing 737-800", 189, 2600, 10700, 6800, 17500, 700, 5436),
    ("Narrow-body", "Boeing 737 MAX 8", 176, 2300, 10400, 6600, 17000, 700, 6570),
    ("Wide-body", "Boeing 787-8", 242, 5200, 15000, 9500, 24400, 1000, 13620),
    ("Wide-body", "Boeing 787-9", 294, 5400, 15600, 9900, 25500, 1000, 14140),
    ("Regional", "ATR 72-600", 70, 600, 5800, 3700, 9500, 400, 1528),
    ("Regional", "Embraer E190", 100, 1800, 11400, 7200, 18500, 750, 4537),
    ("Cargo", "Boeing 767-300F", 0, 4600, 23000, 14600, 37600, 1500, 6500),
]

# Le rayon d'action conditionne l'affectation d'un appareil a une liaison : il
# est utilise par le module d'optimisation pour ne proposer que des avions
# reellement capables de desservir le secteur etudie.

# ── Aéroports (code, nom, ville, pays, redevance atterrissage MAD) ──────────
# La redevance d'atterrissage dépend de la masse maximale de l'appareil et du
# niveau tarifaire de l'aéroport : elle est nettement plus élevée sur les
# plateformes européennes et nord-américaines qu'au Maroc.
DEMO_AIRPORTS = [
    ("CMN", "Mohammed V", "Casablanca", "Maroc", 5200),
    ("RAK", "Marrakech Menara", "Marrakech", "Maroc", 4200),
    ("AGA", "Al Massira", "Agadir", "Maroc", 3900),
    ("TNG", "Ibn Batouta", "Tanger", "Maroc", 3700),
    ("FEZ", "Fes-Saiss", "Fes", "Maroc", 3600),
    ("OUD", "Angads", "Oujda", "Maroc", 3400),
    ("RBA", "Sale", "Rabat", "Maroc", 3500),
    ("EUN", "Hassan Ier", "Laayoune", "Maroc", 3800),
    ("VIL", "Dakhla", "Dakhla", "Maroc", 4100),
    ("CDG", "Charles de Gaulle", "Paris", "France", 19500),
    ("ORY", "Orly", "Paris", "France", 16800),
    ("MAD", "Barajas", "Madrid", "Espagne", 13200),
    ("BCN", "El Prat", "Barcelone", "Espagne", 12600),
    ("LHR", "Heathrow", "Londres", "UK", 21400),
    ("BRU", "Zaventem", "Bruxelles", "Belgique", 12900),
    ("AMS", "Schiphol", "Amsterdam", "Pays-Bas", 14100),
    ("JFK", "John F. Kennedy", "New York", "USA", 27600),
    ("IAD", "Dulles", "Washington", "USA", 24800),
    ("YUL", "Pierre Elliott Trudeau", "Montreal", "Canada", 19200),
    ("DSS", "Blaise Diagne", "Dakar", "Senegal", 11800),
    ("ABJ", "Felix-Houphouet-Boigny", "Abidjan", "Cote d'Ivoire", 12200),
    ("DLA", "Douala International", "Douala", "Cameroun", 11600),
    ("DXB", "Dubai International", "Dubai", "EAU", 17400),
    ("JED", "King Abdulaziz", "Djeddah", "Arabie Saoudite", 15200),
    ("CAI", "International", "Le Caire", "Egypte", 11400),
    ("IST", "Istanbul Airport", "Istanbul", "Turquie", 12800),
    ("LOS", "Murtala Muhammed", "Lagos", "Nigeria", 12400),
]

# ── Spécification des routes et de leurs séries de vols ────────────────────
#
# Chaque route est un dict :
#   number   : préfixe du numéro de vol (ex. "AT-780")
#   dep/arr  : codes IATA
#   aircraft : index (1-based) dans DEMO_AIRCRAFT
#   distance : km (distance orthodromique)
#   duration : heures (temps de vol bloc, roulage inclus)
#   catering : MAD/pax
#   handling : MAD par rotation (assistance en escale)
#   taxes    : MAD (redevances aéroportuaires et de navigation)
#   status   : "completed" (calculé) ou "planned" (non calculé)
#   weeks    : liste de dicts {pax, fuel, price} pour chaque vol hebdomadaire.
#              Les vols sont insérés dans l'ordre = ordre chronologique, ce qui
#              alimente la régression linéaire de la prévision.
#
# Les prix de billet ont été déterminés de façon à placer chaque route dans
# l'issue métier visée : le réseau compte environ deux tiers de routes
# rentables et un tiers de routes à l'équilibre ou déficitaires, ce qui
# correspond à la structure d'un réseau réel (et non à un réseau idéal).


def _weeks(start_pax, step_pax, start_fuel, step_fuel, start_price, step_price, n):
    """Génère n semaines avec évolution linéaire de pax/fuel/prix."""
    return [
        {
            "pax": round(start_pax + step_pax * i),
            "fuel": round(start_fuel + step_fuel * i, 2),
            "price": round(start_price + step_price * i),
        }
        for i in range(n)
    ]


def build_demo_flights() -> list:
    """Construit la liste complète des vols de démonstration."""
    routes = []

    # ── Europe ────────────────────────────────────────────────────────────
    # 1) CDG — route phare du réseau, rentable et en croissance (737-800).
    routes.append({
        "number": "AT-780", "dep": "CMN", "arr": "CDG", "aircraft": 1,
        "distance": 1931.0, "duration": 2.95, "catering": 75, "handling": 16000,
        "taxes": 15000, "status": "completed",
        "weeks": _weeks(155, 3, 9.05, 0.03, 1420, 20, 8),
    })
    # 2) ORY — rentable, en léger déclin : le carburant progresse.
    routes.append({
        "number": "AT-782", "dep": "CMN", "arr": "ORY", "aircraft": 1,
        "distance": 1896.0, "duration": 2.90, "catering": 75, "handling": 16000,
        "taxes": 14000, "status": "completed",
        "weeks": _weeks(158, -2, 9.00, 0.05, 1480, 5, 8),
    })
    # 3) BRU — équilibre : marge très mince mais stable.
    routes.append({
        "number": "AT-824", "dep": "CMN", "arr": "BRU", "aircraft": 1,
        "distance": 2182.0, "duration": 3.00, "catering": 75, "handling": 16000,
        "taxes": 13500, "status": "completed",
        "weeks": _weeks(147, 0, 9.05, 0.02, 1510, 0, 7),
    })
    # 4) AMS — bon rendement, mais le remplissage s'érode.
    routes.append({
        "number": "AT-850", "dep": "CMN", "arr": "AMS", "aircraft": 2,
        "distance": 2327.0, "duration": 3.10, "catering": 75, "handling": 16000,
        "taxes": 14000, "status": "completed",
        "weeks": _weeks(163, -3, 9.05, 0.03, 1520, -5, 7),
    })
    # 5) LHR — la plus rentable du court-courrier, stable.
    routes.append({
        "number": "AT-880", "dep": "CMN", "arr": "LHR", "aircraft": 1,
        "distance": 2092.0, "duration": 3.00, "catering": 75, "handling": 18000,
        "taxes": 18000, "status": "completed",
        "weeks": _weeks(158, 1, 9.10, 0.02, 1540, 8, 8),
    })
    # 6) MAD — déficitaire : faible remplissage et guerre des prix low-cost.
    routes.append({
        "number": "AT-860", "dep": "CMN", "arr": "MAD", "aircraft": 1,
        "distance": 868.0, "duration": 1.75, "catering": 60, "handling": 9300,
        "taxes": 11000, "status": "completed",
        "weeks": _weeks(110, -2, 9.10, 0.04, 1230, -8, 6),
    })
    # 7) BCN — la plus déficitaire : forte concurrence, prix plancher.
    routes.append({
        "number": "AT-866", "dep": "CMN", "arr": "BCN", "aircraft": 1,
        "distance": 1227.0, "duration": 2.00, "catering": 60, "handling": 9300,
        "taxes": 11000, "status": "completed",
        "weeks": _weeks(97, -3, 9.10, 0.05, 1450, -15, 5),
    })
    # 8) IST — moyen-courrier long, marge mince mais stable.
    routes.append({
        "number": "AT-840", "dep": "CMN", "arr": "IST", "aircraft": 1,
        "distance": 3311.0, "duration": 4.40, "catering": 85, "handling": 13500,
        "taxes": 13000, "status": "completed",
        "weeks": _weeks(152, 1, 9.05, 0.03, 1990, 5, 6),
    })

    # ── Amérique du Nord ──────────────────────────────────────────────────
    # 9) JFK — transatlantique très rentable et en croissance (787-9).
    routes.append({
        "number": "AT-200", "dep": "CMN", "arr": "JFK", "aircraft": 4,
        "distance": 5808.0, "duration": 7.80, "catering": 160, "handling": 31000,
        "taxes": 26000, "status": "completed",
        "weeks": _weeks(232, 3, 8.90, 0.02, 3980, 20, 8),
    })
    # 10) IAD — rentable mais marge déclinante (carburant en hausse).
    routes.append({
        "number": "AT-206", "dep": "CMN", "arr": "IAD", "aircraft": 3,
        "distance": 6163.0, "duration": 8.10, "catering": 160, "handling": 31000,
        "taxes": 26000, "status": "completed",
        "weeks": _weeks(198, -3, 8.95, 0.06, 4950, -10, 7),
    })
    # 11) YUL — déficitaire : basse saison et remplissage insuffisant.
    routes.append({
        "number": "AT-208", "dep": "CMN", "arr": "YUL", "aircraft": 4,
        "distance": 5687.0, "duration": 7.60, "catering": 160, "handling": 31000,
        "taxes": 22000, "status": "completed",
        "weeks": _weeks(190, -4, 9.00, 0.05, 4480, -25, 6),
    })

    # ── Moyen-Orient ──────────────────────────────────────────────────────
    # 12) DXB — très rentable, forte croissance.
    routes.append({
        "number": "AT-990", "dep": "CMN", "arr": "DXB", "aircraft": 4,
        "distance": 6091.0, "duration": 7.60, "catering": 160, "handling": 26000,
        "taxes": 18000, "status": "completed",
        "weeks": _weeks(238, 4, 8.95, 0.02, 3740, 15, 9),
    })
    # 13) JED — rentable mais volatil (saisonnalité de la Omra).
    routes.append({
        "number": "AT-992", "dep": "CMN", "arr": "JED", "aircraft": 3,
        "distance": 4754.0, "duration": 6.10, "catering": 150, "handling": 26000,
        "taxes": 16000, "status": "completed",
        "weeks": _weeks(206, -4, 8.95, 0.04, 3660, -12, 5),
    })

    # ── Afrique ───────────────────────────────────────────────────────────
    # 14) CAI — à l'équilibre : le point mort est atteint au remplissage réel.
    routes.append({
        "number": "AT-270", "dep": "CMN", "arr": "CAI", "aircraft": 1,
        "distance": 3691.0, "duration": 4.80, "catering": 85, "handling": 13500,
        "taxes": 12000, "status": "completed",
        "weeks": _weeks(138, -2, 9.05, 0.04, 2480, -8, 6),
    })
    # 15) MAD — 737 MAX 8, rentable mais volatil (concurrence low-cost).
    routes.append({
        "number": "AT-235", "dep": "CMN", "arr": "MAD", "aircraft": 2,
        "distance": 868.0, "duration": 1.75, "catering": 60, "handling": 9300,
        "taxes": 11000, "status": "completed",
        "weeks": _weeks(150, 1, 9.05, 0.04, 930, 6, 7),
    })
    # 16) DSS — 737 MAX 8, Afrique de l'Ouest déficitaire (basse saison).
    routes.append({
        "number": "AT-505", "dep": "CMN", "arr": "DSS", "aircraft": 2,
        "distance": 2282.0, "duration": 3.30, "catering": 85, "handling": 13000,
        "taxes": 12500, "status": "completed",
        "weeks": _weeks(116, -2, 9.05, 0.04, 1940, -12, 6),
    })
    # 17) DSS — 737-800, hub Afrique de l'Ouest rentable en croissance.
    routes.append({
        "number": "AT-501", "dep": "CMN", "arr": "DSS", "aircraft": 1,
        "distance": 2282.0, "duration": 3.30, "catering": 85, "handling": 13000,
        "taxes": 12500, "status": "completed",
        "weeks": _weeks(152, 2, 9.05, 0.03, 1520, 8, 8),
    })
    # 18) ABJ — déficitaire : remplissage faible en basse saison.
    routes.append({
        "number": "AT-533", "dep": "CMN", "arr": "ABJ", "aircraft": 1,
        "distance": 3135.0, "duration": 4.30, "catering": 85, "handling": 13000,
        "taxes": 14000, "status": "completed",
        "weeks": _weeks(120, -2, 9.05, 0.04, 2420, -12, 5),
    })
    # 19) DLA — déficitaire : secteur long, demande insuffisante.
    routes.append({
        "number": "AT-507", "dep": "CMN", "arr": "DLA", "aircraft": 1,
        "distance": 3715.0, "duration": 5.00, "catering": 85, "handling": 13000,
        "taxes": 14500, "status": "completed",
        "weeks": _weeks(116, -2, 9.00, 0.04, 2790, -8, 5),
    })
    # 20) LOS — rentable et en croissance : hub Nigeria.
    routes.append({
        "number": "AT-555", "dep": "CMN", "arr": "LOS", "aircraft": 1,
        "distance": 3173.0, "duration": 4.40, "catering": 85, "handling": 13000,
        "taxes": 14000, "status": "completed",
        "weeks": _weeks(148, 2, 9.00, 0.03, 2040, 10, 8),
    })

    # ── Domestique Maroc ──────────────────────────────────────────────────
    # 21) RAK — navette très rentable (fort remplissage, prix correct).
    routes.append({
        "number": "AT-411", "dep": "CMN", "arr": "RAK", "aircraft": 6,
        "distance": 200.0, "duration": 0.80, "catering": 45, "handling": 5200,
        "taxes": 4200, "status": "completed",
        "weeks": _weeks(78, 0, 9.05, 0.02, 760, 4, 9),
    })
    # 22) AGA — déficitaire : faible demande sur un secteur très court.
    routes.append({
        "number": "AT-421", "dep": "CMN", "arr": "AGA", "aircraft": 5,
        "distance": 379.0, "duration": 1.05, "catering": 40, "handling": 3100,
        "taxes": 4500, "status": "completed",
        "weeks": _weeks(52, -2, 9.10, 0.02, 800, -4, 6),
    })
    # 23) TNG — rentable.
    routes.append({
        "number": "AT-431", "dep": "CMN", "arr": "TNG", "aircraft": 5,
        "distance": 303.0, "duration": 0.95, "catering": 40, "handling": 3100,
        "taxes": 4500, "status": "completed",
        "weeks": _weeks(58, 1, 9.10, 0.02, 590, 2, 7),
    })
    # 24) OUD — rentable.
    routes.append({
        "number": "AT-441", "dep": "CMN", "arr": "OUD", "aircraft": 6,
        "distance": 546.0, "duration": 1.15, "catering": 45, "handling": 5200,
        "taxes": 4800, "status": "completed",
        "weeks": _weeks(82, 1, 9.05, 0.02, 950, 6, 8),
    })
    # 25) EUN — secteur domestique long, marge modérée.
    routes.append({
        "number": "AT-451", "dep": "CMN", "arr": "EUN", "aircraft": 5,
        "distance": 876.0, "duration": 1.90, "catering": 40, "handling": 4500,
        "taxes": 5600, "status": "completed",
        "weeks": _weeks(54, 1, 9.05, 0.02, 1100, 4, 7),
    })
    # 26) FEZ — à l'équilibre.
    routes.append({
        "number": "AT-461", "dep": "CMN", "arr": "FEZ", "aircraft": 5,
        "distance": 250.0, "duration": 0.85, "catering": 40, "handling": 3100,
        "taxes": 4200, "status": "completed",
        "weeks": _weeks(54, 0, 9.10, 0.02, 555, 1, 6),
    })
    # 27) VIL — Dakhla, déficitaire : secteur long et demande saisonnière.
    routes.append({
        "number": "AT-462", "dep": "CMN", "arr": "VIL", "aircraft": 1,
        "distance": 1344.0, "duration": 2.35, "catering": 55, "handling": 5600,
        "taxes": 7500, "status": "completed",
        "weeks": _weeks(120, -2, 9.05, 0.03, 1370, -8, 5),
    })

    # ── Fret ──────────────────────────────────────────────────────────────
    # 28) Cargo CDG — vol planifié, non calculé (aucun passager).
    routes.append({
        "number": "AT-701", "dep": "CMN", "arr": "CDG", "aircraft": 7,
        "distance": 1931.0, "duration": 2.95, "catering": 0, "handling": 28000,
        "taxes": 16000, "status": "planned",
        "weeks": [{"pax": 0, "fuel": 9.05, "price": 0}],
    })
    # 29) Cargo DXB — vol de fret planifié, non calculé.
    routes.append({
        "number": "AT-702", "dep": "CMN", "arr": "DXB", "aircraft": 7,
        "distance": 6091.0, "duration": 7.60, "catering": 0, "handling": 28000,
        "taxes": 20000, "status": "planned",
        "weeks": [{"pax": 0, "fuel": 8.95, "price": 0}],
    })

    flights = []
    for route in routes:
        for i, week in enumerate(route["weeks"]):
            flights.append({
                "flight_number": route["number"],
                "departure_airport": route["dep"],
                "arrival_airport": route["arr"],
                "distance_km": route["distance"],
                "duration_hours": route["duration"],
                "aircraft_id": route["aircraft"],
                "passengers": week["pax"],
                "fuel_price_per_liter": week["fuel"],
                "ticket_price_avg": week["price"],
                "catering_cost_per_pax": route.get("catering", 25.0),
                "handling_cost": route.get("handling", 500.0),
                "taxes_airport": route.get("taxes", 0.0),
                "flight_date": _flight_date(i),
                "status": route["status"],
            })
    return flights


def _flight_date(week_index: int) -> str:
    """Renvoie une date de vol hebdomadaire à partir du 2026-01-04.

    Permet d'étaler les vols dans le temps de façon déterministe.
    """
    import datetime
    base = datetime.date(2026, 1, 4)
    return (base + datetime.timedelta(weeks=week_index)).isoformat()
