from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_current_user
from app.schemas import (
    FlightIdRequest,
    KpiOut,
    MonteCarloOut,
    MonteCarloRequest,
    OptimizationOut,
    OptimizationRequest,
)
from app.services.decision import compute_kpis, monte_carlo, optimize

router = APIRouter(prefix="/decision", tags=["decision"])


@router.post("/kpis", response_model=KpiOut)
def kpis(body: FlightIdRequest, _=Depends(get_current_user)):
    try:
        return compute_kpis(body.flight_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/monte-carlo", response_model=MonteCarloOut)
def run_monte_carlo(body: MonteCarloRequest, _=Depends(get_current_user)):
    try:
        return monte_carlo(
            body.flight_id, body.n_sims, body.fuel_std_pct, body.pax_std_pct, body.ticket_std_pct
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/optimize", response_model=OptimizationOut)
def run_optimize(body: OptimizationRequest, _=Depends(get_current_user)):
    try:
        return optimize(body.flight_id, body.ticket_min, body.ticket_max, body.ticket_step)
    except ValueError as e:
        raise HTTPException(400, str(e))
