from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_current_user
from app.schemas import ForecastOut, ForecastRequest
from app.services.forecast import run_forecast

router = APIRouter(prefix="/forecast", tags=["forecast"])


@router.post("", response_model=ForecastOut)
def forecast(body: ForecastRequest, _=Depends(get_current_user)):
    try:
        return run_forecast(body.aircraft_id, body.horizon)
    except ValueError as e:
        raise HTTPException(400, str(e))
