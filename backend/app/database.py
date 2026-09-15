import psycopg
from psycopg.rows import dict_row

from app.config import DATABASE_URL
from app.seed_data import DEMO_AIRCRAFT, DEMO_AIRPORTS, build_demo_flights

# ── Schéma (PostgreSQL) ─────────────────────────────────────────────────
SCHEMA_STATEMENTS = [
    """CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'analyst',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""",
    """CREATE TABLE IF NOT EXISTS aircraft (
        id BIGSERIAL PRIMARY KEY,
        type TEXT NOT NULL, model TEXT NOT NULL, capacity INTEGER NOT NULL,
        fuel_consumption_per_hour REAL NOT NULL,
        maintenance_cost_per_hour REAL NOT NULL,
        amortization_cost_per_hour REAL NOT NULL,
        crew_cost_per_hour REAL NOT NULL,
        insurance_cost_per_hour REAL NOT NULL,
        range_km REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""",
    """CREATE TABLE IF NOT EXISTS airports (
        id BIGSERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
        city TEXT NOT NULL, country TEXT NOT NULL, landing_fee REAL DEFAULT 0)""",
    """CREATE TABLE IF NOT EXISTS flights (
        id BIGSERIAL PRIMARY KEY,
        flight_number TEXT NOT NULL, departure_airport TEXT NOT NULL,
        arrival_airport TEXT NOT NULL, distance_km REAL NOT NULL,
        duration_hours REAL NOT NULL, aircraft_id BIGINT NOT NULL,
        passengers INTEGER NOT NULL, fuel_price_per_liter REAL NOT NULL,
        ticket_price_avg REAL NOT NULL, catering_cost_per_pax REAL DEFAULT 25.0,
        handling_cost REAL DEFAULT 500.0, taxes_airport REAL DEFAULT 0.0,
        flight_date DATE, status TEXT DEFAULT 'planned',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (aircraft_id) REFERENCES aircraft(id),
        FOREIGN KEY (departure_airport) REFERENCES airports(code),
        FOREIGN KEY (arrival_airport) REFERENCES airports(code))""",
    """CREATE TABLE IF NOT EXISTS cost_results (
        id BIGSERIAL PRIMARY KEY,
        flight_id BIGINT NOT NULL UNIQUE, fixed_costs REAL NOT NULL,
        variable_costs REAL NOT NULL, total_cost REAL NOT NULL,
        total_revenue REAL NOT NULL, cost_per_passenger REAL NOT NULL,
        break_even_passengers INTEGER NOT NULL, profit_margin REAL NOT NULL,
        is_profitable INTEGER NOT NULL,
        calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (flight_id) REFERENCES flights(id))""",
    """CREATE TABLE IF NOT EXISTS simulations (
        id BIGSERIAL PRIMARY KEY,
        flight_id BIGINT NOT NULL, scenario_name TEXT NOT NULL,
        fuel_price_variation REAL DEFAULT 0, load_factor_variation REAL DEFAULT 0,
        ticket_price_variation REAL DEFAULT 0,
        extra_tax REAL DEFAULT 0, simulated_total_cost REAL,
        simulated_revenue REAL, simulated_margin REAL,
        simulated_fixed REAL, simulated_variable REAL,
        simulated_passengers INTEGER, simulated_ticket_price REAL,
        break_even_passengers INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (flight_id) REFERENCES flights(id))""",
]


def get_connection() -> psycopg.Connection:
    """Ouvre une connexion PostgreSQL configurée pour renvoyer des dict-like rows."""
    conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
    return conn


# Contraintes de cle etrangere ajoutées séparément (CREATE TABLE IF NOT EXISTS ne
# recrée pas les tables déjà existantes). Permet d'appliquer les relations
# Aéroports <-> Vols sur des bases déjà initialisées sans les recréer.
FK_STATEMENTS = [
    """ALTER TABLE flights
       DROP CONSTRAINT IF EXISTS flights_departure_airport_fkey""",
    """ALTER TABLE flights
       DROP CONSTRAINT IF EXISTS flights_arrival_airport_fkey""",
    """ALTER TABLE flights
       ADD CONSTRAINT flights_departure_airport_fkey
       FOREIGN KEY (departure_airport) REFERENCES airports(code)""",
    """ALTER TABLE flights
       ADD CONSTRAINT flights_arrival_airport_fkey
       FOREIGN KEY (arrival_airport) REFERENCES airports(code)""",
]

# Migrations légères appliquées à chaque démarrage (idempotentes) pour faire
# évoluer le schéma des bases déjà initialisées sans les recréer.
MIGRATION_STATEMENTS = [
    """ALTER TABLE simulations
       ADD COLUMN IF NOT EXISTS ticket_price_variation REAL DEFAULT 0""",
    """ALTER TABLE simulations
       ADD COLUMN IF NOT EXISTS simulated_fixed REAL""",
    """ALTER TABLE simulations
       ADD COLUMN IF NOT EXISTS simulated_variable REAL""",
    """ALTER TABLE simulations
       ADD COLUMN IF NOT EXISTS simulated_passengers INTEGER""",
    """ALTER TABLE simulations
       ADD COLUMN IF NOT EXISTS simulated_ticket_price REAL""",
    """ALTER TABLE simulations
       ADD COLUMN IF NOT EXISTS break_even_passengers INTEGER""",
    """ALTER TABLE aircraft
       ADD COLUMN IF NOT EXISTS range_km REAL DEFAULT 0""",
]

# Le poste "cout d'exploitation de l'appareil" etait historiquement stocke par
# vol ; il est desormais stocke par HEURE DE VOL et multiplie par la duree du
# vol dans compute_cost(). Les bases existantes sont renommees ici (operation
# idempotente) : les libelles suivent la nouvelle semantique.
_AIRCRAFT_RENAMES = [
    ("maintenance_cost_per_flight", "maintenance_cost_per_hour"),
    ("amortization_cost_per_flight", "amortization_cost_per_hour"),
    ("crew_cost_per_flight", "crew_cost_per_hour"),
    ("insurance_cost_per_flight", "insurance_cost_per_hour"),
]

RENAME_STATEMENTS = [
    f"""DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='aircraft' AND column_name='{old}')
             AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='aircraft' AND column_name='{new}')
          THEN
            ALTER TABLE aircraft RENAME COLUMN {old} TO {new};
          END IF;
        END $$"""
    for old, new in _AIRCRAFT_RENAMES
]


def initialize_database() -> None:
    """Crée les tables si besoin, applique les contraintes, puis peuple de données si vide."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for stmt in SCHEMA_STATEMENTS:
                cur.execute(stmt)
            for stmt in FK_STATEMENTS:
                cur.execute(stmt)
            for stmt in MIGRATION_STATEMENTS:
                cur.execute(stmt)
            for stmt in RENAME_STATEMENTS:
                cur.execute(stmt)
        conn.commit()
    finally:
        conn.close()
    _seed_if_empty()


def _insert_cost_result(cur, flight_id: int, cost: dict) -> None:
    cur.execute(
        "INSERT INTO cost_results (flight_id, fixed_costs, variable_costs, "
        "total_cost, total_revenue, cost_per_passenger, break_even_passengers, "
        "profit_margin, is_profitable) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) "
        "ON CONFLICT (flight_id) DO UPDATE SET "
        "fixed_costs=EXCLUDED.fixed_costs, variable_costs=EXCLUDED.variable_costs, "
        "total_cost=EXCLUDED.total_cost, total_revenue=EXCLUDED.total_revenue, "
        "cost_per_passenger=EXCLUDED.cost_per_passenger, "
        "break_even_passengers=EXCLUDED.break_even_passengers, "
        "profit_margin=EXCLUDED.profit_margin, is_profitable=EXCLUDED.is_profitable",
        (
            flight_id,
            cost["fixed_costs"],
            cost["variable_costs"],
            cost["total_cost"],
            cost["total_revenue"],
            cost["cost_per_passenger"],
            cost["break_even_passengers"],
            cost["profit_margin"],
            1 if cost["is_profitable"] else 0,
        ),
    )


def _seed_demo_simulations(flight_ids: list, demo_flights: list) -> None:
    """Peuple l'historique de simulations du 1er vol de démonstration."""
    from app.services.cost import simulate

    if not flight_ids or not demo_flights:
        return

    # Ne rien faire si des simulations existent déjà (évite les doublons).
    conn = get_connection()
    try:
        count = conn.execute("SELECT COUNT(*) FROM simulations").fetchone()["count"]
    finally:
        conn.close()
    if count > 0:
        return

    first_flight = demo_flights[0]
    conn = get_connection()
    try:
        ac = conn.execute(
            "SELECT * FROM aircraft WHERE id=%s", (first_flight["aircraft_id"],)
        ).fetchone()
    finally:
        conn.close()
    if ac is None:
        return

    demo_scenarios = [
        ("Krach du carburant", -40.0, 0.0, 0.0, 0.0),
        ("Sous-remplissage", 0.0, -40.0, 0.0, 0.0),
        ("Choc pétrolier", 50.0, 0.0, 0.0, 0.0),
        ("Pic de demande", 0.0, 30.0, 15.0, 0.0),
        ("Guerre des prix", 0.0, 5.0, -25.0, 0.0),
    ]
    for name, fuel, load, ticket, tax in demo_scenarios:
        simulate(first_flight, ac, fuel, load, ticket, tax, name)


def _seed_if_empty() -> None:
    from app.security import hash_password
    from app.services.cost import compute_cost

    conn = get_connection()
    try:
        cur = conn.cursor()

        if cur.execute("SELECT COUNT(*) FROM users").fetchone()["count"] == 0:
            # Deux comptes : un admin et un analyste.
            cur.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (%s,%s,%s)",
                ("admin", hash_password("admin123"), "admin"),
            )
            cur.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (%s,%s,%s)",
                ("analyste", hash_password("analyste123"), "analyst"),
            )

        if cur.execute("SELECT COUNT(*) FROM aircraft").fetchone()["count"] == 0:
            cur.executemany(
                "INSERT INTO aircraft (type, model, capacity, fuel_consumption_per_hour, "
                "maintenance_cost_per_hour, amortization_cost_per_hour, crew_cost_per_hour, "
                "insurance_cost_per_hour, range_km) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                DEMO_AIRCRAFT,
            )

        if cur.execute("SELECT COUNT(*) FROM airports").fetchone()["count"] == 0:
            cur.executemany(
                "INSERT INTO airports (code, name, city, country, landing_fee) VALUES (%s,%s,%s,%s,%s)",
                DEMO_AIRPORTS,
            )
        conn.commit()

        if cur.execute("SELECT COUNT(*) FROM flights").fetchone()["count"] == 0:
            demo_flights = build_demo_flights()
            flight_ids = []

            for fl in demo_flights:
                cur.execute(
                    "INSERT INTO flights (flight_number, departure_airport, arrival_airport, "
                    "distance_km, duration_hours, aircraft_id, passengers, fuel_price_per_liter, "
                    "ticket_price_avg, catering_cost_per_pax, handling_cost, taxes_airport, "
                    "flight_date, status) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                    (
                        fl["flight_number"], fl["departure_airport"], fl["arrival_airport"],
                        fl["distance_km"], fl["duration_hours"], fl["aircraft_id"],
                        fl["passengers"], fl["fuel_price_per_liter"], fl["ticket_price_avg"],
                        fl["catering_cost_per_pax"], fl["handling_cost"], fl["taxes_airport"],
                        fl["flight_date"], fl["status"],
                    ),
                )
                flight_ids.append(cur.fetchone()["id"])

            # Les dicts de build_demo_flights() n'ont pas d'id : on rattache l'id
            # DB pour que simulate() (qui lit flight["id"]) puisse insérer les
            # simulations de démonstration sans KeyError.
            for fl, fid in zip(demo_flights, flight_ids):
                fl["id"] = fid

            # Calcule le coût pour chaque vol de passagers (status completed).
            for fid, fl in zip(flight_ids, demo_flights):
                ac = cur.execute("SELECT * FROM aircraft WHERE id=%s", (fl["aircraft_id"],)).fetchone()
                if ac is None:
                    continue
                if fl["passengers"] > 0 and fl["status"] == "completed":
                    _insert_cost_result(cur, fid, compute_cost(fl, ac))
        else:
            flight_ids = []
            demo_flights = []
            # Récupère les vols existants pour alimenter les simulations de démo.
            demo_flights = [
                dict(r) for r in cur.execute(
                    "SELECT * FROM flights ORDER BY id"
                ).fetchall()
            ]
            flight_ids = [f["id"] for f in demo_flights]

        conn.commit()

        # Quelques simulations de démonstration, après avoir committé les vols
        # (la fonction simulate ouvre sa propre connexion et requiert la FK).
        if flight_ids:
            _seed_demo_simulations(flight_ids, demo_flights)

        conn.commit()
    finally:
        conn.close()
