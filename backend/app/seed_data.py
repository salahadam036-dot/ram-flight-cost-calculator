"""Données de démonstration réalistes pour l'application RAM.

Ce module génère un jeu de données complet et varié, couvrant plusieurs
scénarios métier (bon, moyen, mauvais, très mauvais) afin que les tableaux de
bord, les graphiques de prévision et les analyses de risque soient peuplés avec
des tendances crédibles.

Les données sont déterministes (aucun aléa) et calculées pour respecter la
formule de coût réelle (voir app/services/cost.py), de sorte que les marges
affichées sont cohérentes avec les entrées saisies.
"""

# ── Avions (type, model, capacity, fuel L/h, maintenance, amortissement,
#          équipage, assurance) — montants en MAD ────────────────────────────
# Les coûts fixes (amortissement + équipage + assurance) reflètent le coût réel
# par vol d'un appareil : ils sont élevés pour produire des marges réalistes
# (les compagnies aériennes dégagent rarement plus de 20-30 % de marge).
DEMO_AIRCRAFT = [
    ("Narrow-body", "Boeing 737-800", 189, 2600, 16000, 34000, 23000, 5800),
    ("Narrow-body", "Boeing 737 MAX 8", 178, 2300, 14500, 36000, 25000, 6100),
    ("Wide-body", "Boeing 787-8", 242, 5200, 36000, 78000, 54000, 13500),
    ("Wide-body", "Boeing 787-9", 294, 5400, 40000, 88000, 60000, 15000),
    ("Regional", "ATR 72-600", 70, 600, 6200, 11000, 8200, 2000),
    ("Regional", "Embraer E190", 100, 1800, 9000, 18000, 12500, 3000),
    ("Cargo", "Boeing 767-300F", 0, 4600, 31000, 74000, 47000, 12500),
]

# ── Aéroports (code, nom, ville, pays, redevance atterrissage MAD) ──────────
DEMO_AIRPORTS = [
    ("CMN", "Mohammed V", "Casablanca", "Maroc", 850),
    ("RAK", "Marrakech Menara", "Marrakech", "Maroc", 620),
    ("AGA", "Al Massira", "Agadir", "Maroc", 600),
    ("TNG", "Ibn Batouta", "Tanger", "Maroc", 550),
    ("FEZ", "Fes-Saiss", "Fes", "Maroc", 580),
    ("OUD", "Angads", "Oujda", "Maroc", 540),
    ("RBA", "Sale", "Rabat", "Maroc", 590),
    ("CDG", "Charles de Gaulle", "Paris", "France", 2500),
    ("ORY", "Orly", "Paris", "France", 2100),
    ("MAD", "Barajas", "Madrid", "Espagne", 1800),
    ("BCN", "El Prat", "Barcelone", "Espagne", 1700),
    ("LHR", "Heathrow", "Londres", "UK", 3200),
    ("BRU", "Zaventem", "Bruxelles", "Belgique", 1650),
    ("AMS", "Schiphol", "Amsterdam", "Pays-Bas", 2050),
    ("JFK", "John F. Kennedy", "New York", "USA", 3800),
    ("IAD", "Dulles", "Washington", "USA", 3400),
    ("YUL", "Pierre Elliott Trudeau", "Montréal", "Canada", 2600),
    ("DSS", "Blaise Diagne", "Dakar", "Sénégal", 1900),
    ("ABJ", "Félix-Houphouët-Boigny", "Abidjan", "Côte d'Ivoire", 1850),
    ("DLA", "Douala International", "Douala", "Cameroun", 1780),
    ("DXB", "Dubai International", "Dubai", "EAU", 2200),
    ("JED", "King Abdulaziz", "Djeddah", "Arabie Saoudite", 1750),
    ("CAI", "International", "Le Caire", "Égypte", 1480),
    ("IST", "Istanbul Airport", "Istanbul", "Turquie", 1550),
    ("LOS", "Murtala Muhammed", "Lagos", "Nigéria", 1620),
]

# ── Spécification des routes et de leurs séries de vols ────────────────────
#
# Chaque route est un dict :
#   number   : préfixe du numéro de vol (ex. "AT-780")
#   dep/arr  : codes IATA
#   aircraft : index (1-based) dans DEMO_AIRCRAFT
#   distance : km
#   duration : heures
#   catering : MAD/pax (par défaut 25)
#   handling : MAD (par défaut 500)
#   taxes    : MAD (par défaut 0)
#   status   : "completed" (calculé) ou "planned" (non calculé)
#   weeks    : liste de dicts {pax, fuel, price} pour chaque vol hebdomadaire.
#              Les vols sont insérés dans l'ordre = ordre chronologique,
#              ce qui alimente la régression linéaire de la prévision.
#
# Les valeurs (pax, prix du carburant, prix du billet) sont choisies pour
# produire des issues réalistes : certains créneaux sont très rentables,
# d'autres à l'équilibre, d'autres franchement déficitaires.

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

    # 1) Fortement rentable et en croissance — CDG (787-9, gros remplissage).
    routes.append({
        "number": "AT-780", "dep": "CMN", "arr": "CDG", "aircraft": 4,
        "distance": 1975.0, "duration": 2.9, "catering": 32, "handling": 550,
        "taxes": 2500, "status": "completed",
        "weeks": _weeks(230, 5, 9.5, 0.05, 1150, 25, 8),
    })
    # 2) Rentable mais en déclin léger — ORY (747-800) : le carburant monte.
    routes.append({
        "number": "AT-782", "dep": "CMN", "arr": "ORY", "aircraft": 1,
        "distance": 1904.0, "duration": 2.8, "catering": 30, "handling": 540,
        "taxes": 2100, "status": "completed",
        "weeks": _weeks(175, -4, 9.4, 0.12, 1250, 0, 8),
    })
    # 3) Équilibre stable / break-even — BRU (787-8).
    routes.append({
        "number": "AT-824", "dep": "CMN", "arr": "BRU", "aircraft": 3,
        "distance": 2145.0, "duration": 3.1, "catering": 30, "handling": 560,
        "taxes": 1650, "status": "completed",
        "weeks": _weeks(150, 0, 9.5, 0.03, 1300, 0, 7),
    })
    # 4) AMS — bon rendement déclinant (baisse du remplissage).
    routes.append({
        "number": "AT-850", "dep": "CMN", "arr": "AMS", "aircraft": 3,
        "distance": 2330.0, "duration": 3.4, "catering": 30, "handling": 560,
        "taxes": 2050, "status": "completed",
        "weeks": _weeks(210, -8, 9.4, 0.05, 1700, -10, 7),
    })
    # 5) LHR — très rentable, stable.
    routes.append({
        "number": "AT-880", "dep": "CMN", "arr": "LHR", "aircraft": 4,
        "distance": 2280.0, "duration": 3.1, "catering": 34, "handling": 580,
        "taxes": 3200, "status": "completed",
        "weeks": _weeks(255, 0, 9.6, 0.02, 2200, 10, 8),
    })
    # 6) MAD — déficitaire structurel (faible remplissage + prix bas).
    routes.append({
        "number": "AT-860", "dep": "CMN", "arr": "MAD", "aircraft": 1,
        "distance": 980.0, "duration": 1.8, "catering": 24, "handling": 500,
        "taxes": 1800, "status": "completed",
        "weeks": _weeks(90, -2, 9.6, 0.06, 620, 0, 6),
    })
    # 7) BCN — très déficitaire (forte concurrence : prix plancher).
    routes.append({
        "number": "AT-866", "dep": "CMN", "arr": "BCN", "aircraft": 1,
        "distance": 1290.0, "duration": 2.1, "catering": 24, "handling": 510,
        "taxes": 1700, "status": "completed",
        "weeks": _weeks(70, -3, 9.6, 0.08, 480, 0, 5),
    })
    # 8) IST — long-courrier moyen, marge mince mais stable.
    routes.append({
        "number": "AT-840", "dep": "CMN", "arr": "IST", "aircraft": 3,
        "distance": 3530.0, "duration": 4.6, "catering": 32, "handling": 550,
        "taxes": 1550, "status": "completed",
        "weeks": _weeks(180, 0, 9.4, 0.04, 1450, 0, 6),
    })
    # 9) JFK — transatlantique très rentable, croissance.
    routes.append({
        "number": "AT-200", "dep": "CMN", "arr": "JFK", "aircraft": 4,
        "distance": 5850.0, "duration": 7.8, "catering": 36, "handling": 650,
        "taxes": 3800, "status": "completed",
        "weeks": _weeks(240, 4, 9.2, 0.02, 3900, 40, 8),
    })
    # 10) IAD — transatlantique, marge déclinante (carburant + hausse).
    routes.append({
        "number": "AT-206", "dep": "CMN", "arr": "IAD", "aircraft": 3,
        "distance": 5960.0, "duration": 7.9, "catering": 35, "handling": 640,
        "taxes": 3400, "status": "completed",
        "weeks": _weeks(200, -5, 9.1, 0.09, 3600, 0, 7),
    })
    # 11) YUL — transatlantique déficitaire (basse saison, remplissage faible).
    routes.append({
        "number": "AT-208", "dep": "CMN", "arr": "YUL", "aircraft": 4,
        "distance": 5650.0, "duration": 7.5, "catering": 35, "handling": 640,
        "taxes": 2600, "status": "completed",
        "weeks": _weeks(160, -6, 9.3, 0.07, 2800, -30, 6),
    })
    # 12) DXB — très rentable.
    routes.append({
        "number": "AT-990", "dep": "CMN", "arr": "DXB", "aircraft": 4,
        "distance": 6078.0, "duration": 7.5, "catering": 36, "handling": 620,
        "taxes": 2200, "status": "completed",
        "weeks": _weeks(260, 3, 9.2, 0.02, 3450, 20, 9),
    })
    # 13) JED — rentable mais volatil (pas saisonnier).
    routes.append({
        "number": "AT-992", "dep": "CMN", "arr": "JED", "aircraft": 3,
        "distance": 5270.0, "duration": 6.6, "catering": 34, "handling": 600,
        "taxes": 1750, "status": "completed",
        "weeks": _weeks(220, -10, 9.2, 0.05, 2950, 0, 5),
    })
    # 14) CAI — moyen-courrier déficitaire.
    routes.append({
        "number": "AT-270", "dep": "CMN", "arr": "CAI", "aircraft": 1,
        "distance": 3360.0, "duration": 4.8, "catering": 30, "handling": 540,
        "taxes": 1480, "status": "completed",
        "weeks": _weeks(140, -4, 9.4, 0.06, 1200, -10, 6),
    })
    # 14-bis) MAD — 737 MAX 8, rentable mais volatil (concurrence low-cost).
    routes.append({
        "number": "AT-235", "dep": "CMN", "arr": "MAD", "aircraft": 2,
        "distance": 980.0, "duration": 1.8, "catering": 24, "handling": 500,
        "taxes": 1800, "status": "completed",
        "weeks": _weeks(150, 2, 9.5, 0.05, 950, 12, 7),
    })
    # 14-ter) DSS — 737 MAX 8, Afrique de l'Ouest déficitaire (basse saison).
    routes.append({
        "number": "AT-505", "dep": "CMN", "arr": "DSS", "aircraft": 2,
        "distance": 2440.0, "duration": 3.5, "catering": 28, "handling": 520,
        "taxes": 1900, "status": "completed",
        "weeks": _weeks(120, -5, 9.5, 0.05, 1280, -15, 6),
    })
    # 15) DSS — Afrique de l'Ouest, hub rentable en croissance.
    routes.append({
        "number": "AT-501", "dep": "CMN", "arr": "DSS", "aircraft": 1,
        "distance": 2440.0, "duration": 3.5, "catering": 28, "handling": 520,
        "taxes": 1900, "status": "completed",
        "weeks": _weeks(160, 4, 9.5, 0.03, 1420, 15, 8),
    })
    # 16) ABJ — Afrique, déficitaire (remplissage faible).
    routes.append({
        "number": "AT-533", "dep": "CMN", "arr": "ABJ", "aircraft": 3,
        "distance": 2760.0, "duration": 3.9, "catering": 28, "handling": 530,
        "taxes": 1850, "status": "completed",
        "weeks": _weeks(120, -5, 9.4, 0.05, 1350, -10, 5),
    })
    # 17) DLA — Afrique, déficitaire.
    routes.append({
        "number": "AT-507", "dep": "CMN", "arr": "DLA", "aircraft": 3,
        "distance": 3440.0, "duration": 4.6, "catering": 28, "handling": 540,
        "taxes": 1780, "status": "completed",
        "weeks": _weeks(110, -3, 9.4, 0.05, 1300, 0, 5),
    })
    # 18) LOS — Afrique, rentable.
    routes.append({
        "number": "AT-555", "dep": "CMN", "arr": "LOS", "aircraft": 1,
        "distance": 3100.0, "duration": 4.2, "catering": 27, "handling": 530,
        "taxes": 1620, "status": "completed",
        "weeks": _weeks(155, 2, 9.4, 0.04, 1550, 5, 8),
    })
    # 19) Domestique RAK — navette très rentable (gros remplissage, prix correct).
    routes.append({
        "number": "AT-411", "dep": "CMN", "arr": "RAK", "aircraft": 6,
        "distance": 243.0, "duration": 0.55, "catering": 14, "handling": 380,
        "taxes": 620, "status": "completed",
        "weeks": _weeks(80, 0, 9.6, 0.02, 520, 5, 9),
    })
    # 20) Domestique AGA — déficitaire (faible demande).
    routes.append({
        "number": "AT-421", "dep": "CMN", "arr": "AGA", "aircraft": 5,
        "distance": 380.0, "duration": 0.8, "catering": 15, "handling": 400,
        "taxes": 600, "status": "completed",
        "weeks": _weeks(45, -2, 9.6, 0.03, 500, 0, 6),
    })
    # 21) Domestique TNG — break-even.
    routes.append({
        "number": "AT-431", "dep": "CMN", "arr": "TNG", "aircraft": 5,
        "distance": 330.0, "duration": 0.7, "catering": 15, "handling": 400,
        "taxes": 550, "status": "completed",
        "weeks": _weeks(58, 1, 9.6, 0.02, 560, 0, 7),
    })
    # 22) Domestique OUD — rentable.
    routes.append({
        "number": "AT-441", "dep": "CMN", "arr": "OUD", "aircraft": 6,
        "distance": 540.0, "duration": 0.95, "catering": 16, "handling": 420,
        "taxes": 540, "status": "completed",
        "weeks": _weeks(85, 0, 9.5, 0.03, 780, 10, 8),
    })
    # 23) Domestique RBA — déficitaire (très court, coûts fixes élevés / vol).
    routes.append({
        "number": "AT-451", "dep": "CMN", "arr": "RBA", "aircraft": 5,
        "distance": 120.0, "duration": 0.4, "catering": 13, "handling": 360,
        "taxes": 590, "status": "completed",
        "weeks": _weeks(40, -1, 9.6, 0.04, 400, 0, 5),
    })
    # 24) FEZ — domestique break-even.
    routes.append({
        "number": "AT-461", "dep": "CMN", "arr": "FEZ", "aircraft": 5,
        "distance": 300.0, "duration": 0.7, "catering": 14, "handling": 390,
        "taxes": 580, "status": "completed",
        "weeks": _weeks(55, 0, 9.6, 0.02, 470, 0, 6),
    })
    # 25) Cargo CDG — (0 pax, coût fixe élevé, "revenu" via taxes ? cours cargo).
    #     Le cargo n'a pas de passagers : il est exclu du calcul de coût.
    routes.append({
        "number": "AT-701", "dep": "CMN", "arr": "CDG", "aircraft": 7,
        "distance": 1975.0, "duration": 2.9, "catering": 0, "handling": 1800,
        "taxes": 2500, "status": "planned",
        "weeks": [{"pax": 0, "fuel": 9.6, "price": 0}],
    })
    # 26) Cargo DXB — vol de fret planning (non calculé).
    routes.append({
        "number": "AT-702", "dep": "CMN", "arr": "DXB", "aircraft": 7,
        "distance": 6078.0, "duration": 7.5, "catering": 0, "handling": 2200,
        "taxes": 2200, "status": "planned",
        "weeks": [{"pax": 0, "fuel": 9.2, "price": 0}],
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
