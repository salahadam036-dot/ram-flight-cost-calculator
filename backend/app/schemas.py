from typing import Any, List, Optional

from pydantic import BaseModel


# ── Auth ────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    created_at: Optional[str] = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── Users ───────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "analyst"


class UserUpdate(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None


# ── Aircraft ────────────────────────────────────────────────────────────
class AircraftBase(BaseModel):
    type: str
    model: str
    capacity: int
    fuel_consumption_per_hour: float
    maintenance_cost_per_flight: float
    amortization_cost_per_flight: float
    crew_cost_per_flight: float
    insurance_cost_per_flight: float


class AircraftCreate(AircraftBase):
    pass


class AircraftUpdate(AircraftBase):
    pass


class AircraftOut(AircraftBase):
    id: int


# ── Airports ─────────────────────────────────────────────────────────────
class AirportOut(BaseModel):
    code: str
    name: str
    city: str
    country: str
    landing_fee: float


class AirportCreate(BaseModel):
    code: str
    name: str
    city: str
    country: str
    landing_fee: float = 0


class AirportUpdate(BaseModel):
    name: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    landing_fee: Optional[float] = None


# ── Flights ─────────────────────────────────────────────────────────────
class FlightBase(BaseModel):
    flight_number: str
    departure_airport: str
    arrival_airport: str
    distance_km: float
    duration_hours: float
    aircraft_id: int
    passengers: int
    fuel_price_per_liter: float
    ticket_price_avg: float
    catering_cost_per_pax: float = 25.0
    handling_cost: float = 500.0
    taxes_airport: float = 0.0
    flight_date: Optional[str] = None
    status: str = "planned"


class FlightCreate(FlightBase):
    pass


class FlightUpdate(FlightBase):
    pass


class FlightOut(FlightBase):
    id: int
    aircraft_model: Optional[str] = None
    departure_airport_name: Optional[str] = None
    departure_airport_city: Optional[str] = None
    arrival_airport_name: Optional[str] = None
    arrival_airport_city: Optional[str] = None
    total_cost: Optional[float] = None
    total_revenue: Optional[float] = None
    profit_margin: Optional[float] = None
    is_profitable: Optional[bool] = None


# ── Cost results ────────────────────────────────────────────────────────
class CostDetail(BaseModel):
    amortization: float
    crew: float
    insurance: float
    fuel_liters: float
    fuel_cost: float
    maintenance: float
    catering: float
    handling: float
    taxes: float


class CostResultOut(BaseModel):
    flight_id: int
    fixed_costs: float
    variable_costs: float
    total_cost: float
    total_revenue: float
    cost_per_passenger: float
    break_even_passengers: int
    profit_margin: float
    is_profitable: bool
    detail: Optional[CostDetail] = None


# ── Simulation ──────────────────────────────────────────────────────────
class SimulationRequest(BaseModel):
    flight_id: int
    fuel_variation_pct: float = 0
    load_factor_variation_pct: float = 0
    ticket_price_variation_pct: float = 0
    extra_tax: float = 0
    scenario_name: str = "Simulation"


class SimulationOut(BaseModel):
    scenario_name: str
    new_fuel_price: float
    new_passengers: int
    new_ticket_price: float
    load_factor: float
    fixed_costs: float
    variable_costs: float
    total_cost: float
    total_revenue: float
    profit_margin: float
    profit_amount: float
    break_even_passengers: int
    is_profitable: bool


class SimulationPreset(BaseModel):
    key: str
    name: str
    description: str
    icon: str
    fuel_variation_pct: float
    load_factor_variation_pct: float
    ticket_price_variation_pct: float
    extra_tax: float


class SimulationHistoryOut(BaseModel):
    id: int
    flight_id: int
    scenario_name: str
    fuel_price_variation: float
    load_factor_variation: float
    ticket_price_variation: float
    extra_tax: float
    simulated_total_cost: float
    simulated_revenue: float
    simulated_margin: float
    simulated_profit: Optional[float] = None
    is_profitable: Optional[bool] = None
    created_at: Optional[str] = None


# ── Dashboard ───────────────────────────────────────────────────────────
class DashboardStatsOut(BaseModel):
    total_flights: int
    profitable_flights: int
    deficit_count: int
    avg_margin: float
    total_profit: float
    profitability_rate: float
    avg_fixed_costs: float
    avg_variable_costs: float
    top_flights: List[dict]
    deficit_flights: List[dict]
    by_aircraft: List[dict]


# ── Forecast ────────────────────────────────────────────────────────────
class ForecastRequest(BaseModel):
    aircraft_id: Optional[int] = None
    horizon: int = 5


class ForecastSeriesOut(BaseModel):
    name: str
    unit: str
    color: str
    history: List[float]
    y_pred: List[float]
    y_future: List[float]
    r2: float
    p_value: float
    slope_stderr: float
    ci_lower: List[float]
    ci_upper: List[float]
    trend: str
    slope: float


class ForecastOut(BaseModel):
    label: str
    history_count: int
    horizon: int
    series: List[ForecastSeriesOut]


# ── Decision ────────────────────────────────────────────────────────────
class FlightIdRequest(BaseModel):
    flight_id: int


class KpiOut(BaseModel):
    flight_id: int
    flight_number: str
    route: str
    distance_km: float
    passengers: int
    capacity: int
    ask: float
    rpk: float
    load_factor: float
    rask: float
    cask: float
    yield_val: float
    belf: float
    marge_rask_cask: float
    total_revenue: float
    total_cost: float
    profit_margin: float


class MonteCarloRequest(BaseModel):
    flight_id: int
    n_sims: int = 5000
    fuel_std_pct: float = 10
    pax_std_pct: float = 10
    ticket_std_pct: float = 10


class HistogramBin(BaseModel):
    label: str
    count: int
    center: float


class MonteCarloOut(BaseModel):
    flight_id: int
    n_sims: int
    mean_profit: float
    median_profit: float
    std_profit: float
    ci_mean_lower: float
    ci_mean_upper: float
    prob_loss: float
    var_95: float
    p025: float
    p975: float
    verdict: str
    verdict_color: str
    histogram: List[HistogramBin]


class OptimizationRequest(BaseModel):
    flight_id: int
    ticket_min: int = 500
    ticket_max: int = 5000
    ticket_step: int = 100


class OptimizationOut(BaseModel):
    flight_id: int
    results: List[dict]
    winner: dict


# ── Chatbot ─────────────────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatbotRequest(BaseModel):
    messages: List[ChatMessage]


class ChatbotOut(BaseModel):
    content: str
