"""Etat courant de l'application, fourni a l'assistant conversationnel.

L'assistant ne doit pas seulement decrire les fonctionnalites : il doit pouvoir
repondre sur les donnees reelles (flotte, aeroports, vols, couts, simulations).
Ce module construit un resume compact et borne de la base, injecte dans le
prompt systeme a chaque question (voir app/routers/chatbot.py).

Deux precautions :

- le budget en caracteres evite qu'une base volumineuse ne fasse exploser la
  fenetre de contexte du modele ; au-dela, seuls les vols les plus recents sont
  detailles et le reste est resume ;
- l'horodatage est volontairement a la journee, sans heure : le prompt systeme
  reste ainsi identique d'une question a l'autre, ce qui permet a Ollama de
  reutiliser le cache de prompt au lieu de tout recalculer.

Les montants sont en dirhams (MAD), comme dans l'application.
"""

from app.database import get_connection
from app.services.cost import get_dashboard_stats

# Environ 3 000 jetons. Au-dela, le prompt pese trop lourd face a la fenetre de
# contexte du modele (voir OLLAMA_NUM_CTX dans app/config.py).
BUDGET_CARACTERES = 15000

SEPARATEUR = "\n\n"

GUIDE = """\
APPLICATION
Nom : RAM Flight Cost Calculator (Royal Air Maroc).
Role : calculer, simuler et analyser les couts des vols de la compagnie.
Pages : Tableau de Bord | Vols | Flotte | Aeroports | Scenarios | Prevision | Risque & Rendement | Utilisateurs (admin uniquement).
Roles : "admin" (acces complet) et "analyst".

Regles de calcul appliquees par l'application :
- couts fixes = amortissement + equipage + assurance de l'avion
- couts variables = carburant (consommation horaire x duree x prix du litre) + maintenance + catering (par passager) + handling + taxes d'aeroport
- cout total = couts fixes + couts variables
- revenu = prix moyen du billet x nombre de passagers
- marge (%) = (revenu - cout total) / cout total x 100
- cout par passager = cout total / nombre de passagers
- seuil de rentabilite (BELF) = couts fixes / (prix du billet - cout variable par passager), arrondi au passager superieur
- taux de remplissage = passagers / capacite de l'avion
Un vol est rentable lorsque le revenu couvre le cout total.
Prevision : regression lineaire sur l'historique des vols. Risque : simulation de Monte Carlo et optimisation du prix du billet."""


def _montant(valeur) -> str:
    if valeur is None:
        return "-"
    return ("%.0f" % valeur).replace(",", " ")


def _guide() -> str:
    return GUIDE


def _flotte(conn) -> str:
    lignes = conn.execute(
        "SELECT model, type, capacity, fuel_consumption_per_hour, maintenance_cost_per_flight, "
        "amortization_cost_per_flight, crew_cost_per_flight, insurance_cost_per_flight "
        "FROM aircraft ORDER BY capacity DESC"
    ).fetchall()
    sortie = ["FLOTTE (%d avions). Couts en MAD, par vol" % len(lignes)]
    for r in lignes:
        sortie.append(
            "- %s (%s) : %d sieges, carburant %s L/h, maintenance %s, amortissement %s, "
            "equipage %s, assurance %s"
            % (
                r["model"],
                r["type"],
                r["capacity"],
                _montant(r["fuel_consumption_per_hour"]),
                _montant(r["maintenance_cost_per_flight"]),
                _montant(r["amortization_cost_per_flight"]),
                _montant(r["crew_cost_per_flight"]),
                _montant(r["insurance_cost_per_flight"]),
            )
        )
    return "\n".join(sortie)


def _aeroports(conn) -> str:
    lignes = conn.execute(
        "SELECT code, city, country, landing_fee FROM airports ORDER BY code"
    ).fetchall()
    sortie = [
        "AEROPORTS (%d). Format : code = ville (pays), taxe d'atterrissage en MAD" % len(lignes)
    ]
    for r in lignes:
        sortie.append(
            "- %s = %s (%s), taxe %s"
            % (r["code"], r["city"], r["country"], _montant(r["landing_fee"]))
        )
    return "\n".join(sortie)


def _vols(conn, budget: int) -> str:
    """Liste des vols, groupes par avion.

    Deux precautions :

    - le nombre de vols figure dans l'en-tete de chaque groupe, et un groupe
      n'est inclus que si tous ses vols tiennent dans le budget : la liste ne
      peut donc jamais contredire la section PAR AVION ;
    - les lignes sont tres compactes (id|numero|route|date|passagers|billet|marge),
      le modele d'avion etant deja dans l'en-tete du groupe.
    """
    lignes = conn.execute(
        "SELECT f.id, f.flight_number, f.departure_airport, f.arrival_airport, f.flight_date, "
        "f.status, f.passengers, f.ticket_price_avg, a.model, cr.profit_margin "
        "FROM flights f JOIN aircraft a ON a.id = f.aircraft_id "
        "LEFT JOIN cost_results cr ON cr.flight_id = f.id "
        "ORDER BY a.model, f.id DESC"
    ).fetchall()

    groupes: dict = {}
    for r in lignes:
        groupes.setdefault(r["model"], []).append(r)
    # Les avions les plus utilises en premier.
    ordre = sorted(groupes.items(), key=lambda item: -len(item[1]))

    entete = (
        "%d vols, groupes par avion. Ligne = id|numero|route|date|passagers|prix billet|marge %%. "
        "Le numero de vol se repete sur plusieurs dates : l'identifiant (id) est la seule cle "
        'unique. Une marge vide ("-") signifie que le cout du vol n\'a pas encore ete calcule. '
        "Ces lignes servent a retrouver un vol precis : pour un total, une moyenne, un comptage "
        "ou un classement, utilise les sections ci-dessus."
    ) % len(lignes)

    sortie = ["VOLS", entete]
    taille = len(entete) + len(sortie[0])
    non_detailles = []
    for model, vols in ordre:
        bloc = ["- %s : %d vols" % (model, len(vols))]
        for r in vols:
            marge = "-" if r["profit_margin"] is None else "%+.1f" % r["profit_margin"]
            bloc.append(
                "  %d|%s|%s-%s|%s|%d|%s|%s"
                % (
                    r["id"],
                    r["flight_number"],
                    r["departure_airport"],
                    r["arrival_airport"],
                    r["flight_date"] or "sans date",
                    r["passengers"],
                    _montant(r["ticket_price_avg"]),
                    marge,
                )
            )
        longueur = sum(len(l) + 1 for l in bloc)
        if taille + longueur > budget:
            non_detailles.append(model)
            continue
        sortie.extend(bloc)
        taille += longueur

    if non_detailles:
        sortie.append(
            "Vols non detailles ici (fenetre de contexte limitee), avions concernes : %s"
            % ", ".join(non_detailles)
        )

    autres = [r for r in lignes if r["status"] != "completed"]
    if autres:
        sortie.append(
            'Vols dont le statut n\'est pas "completed" : '
            + ", ".join(
                "%d (%s, %s)" % (r["id"], r["flight_number"], r["status"]) for r in autres
            )
        )
    return "\n".join(sortie)


def _reference(r: dict) -> str:
    return "%s (%s-%s)" % (r["flight_number"], r["departure_airport"], r["arrival_airport"])


def _extreme(conn, ordre: str) -> dict | None:
    """Vol a la marge la plus faible (ASC) ou la plus elevee (DESC)."""
    return conn.execute(
        "SELECT f.flight_number, f.departure_airport, f.arrival_airport, cr.profit_margin "
        "FROM cost_results cr JOIN flights f ON f.id = cr.flight_id "
        "ORDER BY cr.profit_margin " + ordre + " LIMIT 1"
    ).fetchone()


def _indicateurs(stats: dict, conn) -> str:
    """Chiffres globaux.

    Les extremes sont donnes explicitement : le modele ne sait pas comparer 178
    lignes de vol de facon fiable, mieux vaut lui fournir la reponse toute faite.
    """
    total_enregistres = conn.execute("SELECT COUNT(*) AS n FROM flights").fetchone()["n"]
    total_calcules = stats.get("total_flights", 0)
    lignes = [
        "INDICATEURS (sur les %d vols enregistres, %d ont un cout calcule ; les %d autres "
        "sont des vols planifies, sans passagers ni cout)"
        % (total_enregistres, total_calcules, total_enregistres - total_calcules),
        "- vols rentables : %d ; deficitaires : %d ; taux de rentabilite : %d%%"
        % (
            stats.get("profitable_flights", 0),
            stats.get("deficit_count", 0),
            stats.get("profitability_rate", 0),
        ),
        "- marge moyenne : %.1f%% ; profit cumule : %s MAD"
        % (stats.get("avg_margin", 0), _montant(stats.get("total_profit"))),
        "- cout fixe moyen : %s MAD ; cout variable moyen : %s MAD"
        % (_montant(stats.get("avg_fixed_costs")), _montant(stats.get("avg_variable_costs"))),
    ]
    pire = _extreme(conn, "ASC")
    meilleur = _extreme(conn, "DESC")
    if pire:
        lignes.append("- marge la plus faible : %+.1f%% (%s)" % (pire["profit_margin"], _reference(pire)))
    if meilleur:
        lignes.append("- marge la plus elevee : %+.1f%% (%s)" % (meilleur["profit_margin"], _reference(meilleur)))
    return "\n".join(lignes)


def _par_avion(stats: dict) -> str:
    lignes = stats.get("by_aircraft") or []
    if not lignes:
        return ""
    sortie = ["PAR AVION"]
    for r in lignes:
        sortie.append(
            "- %s : %d vols ; cout par passager moyen %s MAD (deja ramene a un passager, "
            "ce n'est pas le cout total du vol) ; marge moyenne %.1f%%"
            % (r["model"], r["flight_count"], _montant(r["avg_cpp"]), r["avg_margin"] or 0)
        )

    # Extremes donnes explicitement : le modele compare mal sept valeurs.
    pire = min(lignes, key=lambda r: r["avg_margin"] or 0)
    meilleur = max(lignes, key=lambda r: r["avg_margin"] or 0)
    sortie.append(
        "Marge moyenne la plus faible : %s (%.1f%%) ; la plus elevee : %s (%.1f%%)"
        % (pire["model"], pire["avg_margin"] or 0, meilleur["model"], meilleur["avg_margin"] or 0)
    )
    return "\n".join(sortie)


def _meilleurs_et_pires(stats: dict) -> str:
    def formater(rows):
        return ", ".join(
            "%s (%s-%s) %+.1f%%" % (r["flight_number"], r["departure_airport"], r["arrival_airport"], r["profit_margin"])
            for r in rows
        ) or "aucun"

    meilleurs = stats.get("top_flights") or []
    deficitaires = stats.get("deficit_flights") or []
    parties = []
    if meilleurs:
        parties.append("5 meilleures marges : %s" % formater(meilleurs))
    if deficitaires:
        parties.append("5 plus fortes pertes : %s" % formater(deficitaires))
    return "\n".join(parties)


def _simulations(conn) -> str:
    lignes = conn.execute(
        "SELECT s.scenario_name, s.fuel_price_variation, s.load_factor_variation, "
        "s.ticket_price_variation, s.extra_tax, s.simulated_margin, f.flight_number "
        "FROM simulations s JOIN flights f ON f.id = s.flight_id ORDER BY s.id"
    ).fetchall()
    if not lignes:
        return "SIMULATIONS : aucune pour le moment."
    sortie = ["SIMULATIONS ENREGISTREES (%d)" % len(lignes)]
    for r in lignes:
        sortie.append(
            "- %s (vol %s) : carburant %+.0f%%, remplissage %+.0f%%, billet %+.0f%%, "
            "taxe %s MAD -> marge %.1f%%"
            % (
                r["scenario_name"],
                r["flight_number"],
                r["fuel_price_variation"] or 0,
                r["load_factor_variation"] or 0,
                r["ticket_price_variation"] or 0,
                _montant(r["extra_tax"]),
                r["simulated_margin"] or 0,
            )
        )
    return "\n".join(sortie)


def _utilisateurs(conn) -> str:
    lignes = conn.execute("SELECT username, role FROM users ORDER BY id").fetchall()
    detail = ", ".join("%s (%s)" % (r["username"], r["role"]) for r in lignes)
    return "COMPTES (%d) : %s" % (len(lignes), detail or "aucun")


def build_app_context(budget: int = BUDGET_CARACTERES) -> str:
    """Resume de l'etat courant de l'application, pret a etre injecte au prompt.

    Les sections de synthese precedent volontairement la liste des vols : le
    modele repond correctement aux questions de comptage et de classement
    lorsqu'il dispose de chiffres deja calcules, et se trompe lorsqu'il doit les
    deduire de centaines de lignes.
    """
    stats = get_dashboard_stats()
    conn = get_connection()
    try:
        parties = [
            _guide(),
            _flotte(conn),
            _aeroports(conn),
            _indicateurs(stats, conn),
            _meilleurs_et_pires(stats),
            _par_avion(stats),
            _simulations(conn),
            _utilisateurs(conn),
        ]
        utilise = sum(len(p) for p in parties) + len(parties) * len(SEPARATEUR)
        parties.append(_vols(conn, max(2000, budget - utilise)))
    finally:
        conn.close()

    parties = [p for p in parties if p]
    return SEPARATEUR.join(parties)
