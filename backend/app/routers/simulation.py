from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_current_user
from app.schemas import (
    SimulationHistoryOut,
    SimulationOut,
    SimulationPreset,
    SimulationRequest,
)
from app.services.cost import (
    delete_simulation,
    get_flight_and_aircraft,
    get_simulations,
    simulate,
)

router = APIRouter(prefix="/simulation", tags=["simulation"])

# ── Scénarios prédéfinis (« made up ») pour la démo ─────────────────────
# Chaque preset est un scénario réaliste qu'un analyste peut appliquer en un
# clic, pour illustrer l'impact de chocs économiques et opérationnels.
PRESETS: list[SimulationPreset] = [
    SimulationPreset(
        key="fuel-crash", name="Krach du carburant",
        description="Le prix du kérosène s'effondre de 40 % : la ligne redevient rentable.",
        icon="fuel", fuel_variation_pct=-40, load_factor_variation_pct=0,
        ticket_price_variation_pct=0, extra_tax=0,
    ),
    SimulationPreset(
        key="fuel-spike", name="Choc pétrolier",
        description="Le carburant grimpe de 50 % : la marge s'évapore brutalement.",
        icon="flame", fuel_variation_pct=50, load_factor_variation_pct=0,
        ticket_price_variation_pct=0, extra_tax=0,
    ),
    SimulationPreset(
        key="demand-boom", name="Pic de demande",
        description="Remplissage à 100 % + hausse du prix des billets de 15 %.",
        icon="trending-up", fuel_variation_pct=0, load_factor_variation_pct=30,
        ticket_price_variation_pct=15, extra_tax=0,
    ),
    SimulationPreset(
        key="empty-flight", name="Sous-remplissage",
        description="Le remplissage chute de 40 points : le vol passe dans le rouge.",
        icon="trending-down", fuel_variation_pct=0, load_factor_variation_pct=-40,
        ticket_price_variation_pct=0, extra_tax=0,
    ),
    SimulationPreset(
        key="price-war", name="Guerre des prix",
        description="Baisse des tarifs de 25 % pour riposter à un low-cost concurrent.",
        icon="swords", fuel_variation_pct=0, load_factor_variation_pct=5,
        ticket_price_variation_pct=-25, extra_tax=0,
    ),
    SimulationPreset(
        key="new-tax", name="Nouvelle taxe",
        description="L'État impose 15 000 MAD de taxes supplémentaires aéroportuaires.",
        icon="landmark", fuel_variation_pct=0, load_factor_variation_pct=0,
        ticket_price_variation_pct=0, extra_tax=15000,
    ),
    SimulationPreset(
        key="crisis", name="Crise globale",
        description="Carburant +30 %, remplissage -25, tarifs -10 : scénario catastrophe.",
        icon="alert-triangle", fuel_variation_pct=30, load_factor_variation_pct=-25,
        ticket_price_variation_pct=-10, extra_tax=5000,
    ),
]


@router.get("/presets", response_model=list[SimulationPreset])
def presets(_=Depends(get_current_user)):
    return PRESETS


@router.post("/simulate", response_model=SimulationOut)
def run_simulation(body: SimulationRequest, _=Depends(get_current_user)):
    flight, aircraft = get_flight_and_aircraft(body.flight_id)
    if flight is None:
        raise HTTPException(404, "Vol introuvable")
    if aircraft is None:
        raise HTTPException(400, f"Avion ID={flight['aircraft_id']} introuvable")
    return simulate(
        flight,
        aircraft,
        body.fuel_variation_pct,
        body.load_factor_variation_pct,
        body.ticket_price_variation_pct,
        body.extra_tax,
        body.scenario_name,
    )


@router.get("/{flight_id}/history", response_model=list[SimulationHistoryOut])
def history(flight_id: int, _=Depends(get_current_user)):
    return get_simulations(flight_id)


@router.delete("/history/{sim_id}")
def delete_history(sim_id: int, _=Depends(get_current_user)):
    if not delete_simulation(sim_id):
        raise HTTPException(404, "Simulation introuvable")
    return {"ok": True}
