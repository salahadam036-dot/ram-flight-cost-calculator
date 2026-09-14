export interface User {
  id: number;
  username: string;
  role: string;
  created_at?: string | null;
}

export interface Aircraft {
  id: number;
  type: string;
  model: string;
  capacity: number;
  fuel_consumption_per_hour: number;
  maintenance_cost_per_flight: number;
  amortization_cost_per_flight: number;
  crew_cost_per_flight: number;
  insurance_cost_per_flight: number;
}

export interface Airport {
  code: string;
  name: string;
  city: string;
  country: string;
  landing_fee: number;
}

export interface Flight {
  id: number;
  flight_number: string;
  departure_airport: string;
  arrival_airport: string;
  distance_km: number;
  duration_hours: number;
  aircraft_id: number;
  passengers: number;
  fuel_price_per_liter: number;
  ticket_price_avg: number;
  catering_cost_per_pax: number;
  handling_cost: number;
  taxes_airport: number;
  flight_date: string | null;
  status: string;
  aircraft_model?: string | null;
  departure_airport_name?: string | null;
  departure_airport_city?: string | null;
  arrival_airport_name?: string | null;
  arrival_airport_city?: string | null;
  total_cost?: number | null;
  total_revenue?: number | null;
  profit_margin?: number | null;
  is_profitable?: boolean | null;
}

export interface CostDetail {
  amortization: number;
  crew: number;
  insurance: number;
  fuel_liters: number;
  fuel_cost: number;
  maintenance: number;
  catering: number;
  handling: number;
  taxes: number;
}

export interface CostResult {
  flight_id: number;
  fixed_costs: number;
  variable_costs: number;
  total_cost: number;
  total_revenue: number;
  cost_per_passenger: number;
  break_even_passengers: number;
  profit_margin: number;
  is_profitable: boolean;
  detail?: CostDetail | null;
}

export interface RankingFlight {
  flight_number: string;
  departure_airport: string;
  arrival_airport: string;
  profit_margin: number;
  profit: number;
}

export interface AircraftStats {
  model: string;
  avg_cpp: number;
  avg_margin: number;
  flight_count: number;
}

export interface DashboardStats {
  total_flights: number;
  profitable_flights: number;
  deficit_count: number;
  avg_margin: number;
  total_profit: number;
  profitability_rate: number;
  avg_fixed_costs: number;
  avg_variable_costs: number;
  top_flights: RankingFlight[];
  deficit_flights: RankingFlight[];
  by_aircraft: AircraftStats[];
}

export interface SimulationResult {
  scenario_name: string;
  new_fuel_price: number;
  new_passengers: number;
  new_ticket_price: number;
  load_factor: number;
  fixed_costs: number;
  variable_costs: number;
  total_cost: number;
  total_revenue: number;
  profit_margin: number;
  profit_amount: number;
  break_even_passengers: number;
  is_profitable: boolean;
}

export interface SimulationPreset {
  key: string;
  name: string;
  description: string;
  icon: string;
  fuel_variation_pct: number;
  load_factor_variation_pct: number;
  ticket_price_variation_pct: number;
  extra_tax: number;
}

export interface SimulationHistory {
  id: number;
  flight_id: number;
  scenario_name: string;
  fuel_price_variation: number;
  load_factor_variation: number;
  ticket_price_variation: number;
  extra_tax: number;
  simulated_total_cost: number;
  simulated_revenue: number;
  simulated_margin: number;
  simulated_profit?: number | null;
  is_profitable?: boolean | null;
  fixed_costs?: number | null;
  variable_costs?: number | null;
  new_passengers?: number | null;
  new_ticket_price?: number | null;
  break_even_passengers?: number | null;
  created_at?: string | null;
}

export interface ForecastSeries {
  name: string;
  unit: string;
  color: string;
  history: number[];
  y_pred: number[];
  y_future: number[];
  r2: number;
  p_value: number;
  slope_stderr: number;
  ci_lower: number[];
  ci_upper: number[];
  trend: string;
  slope: number;
}

export interface ForecastResult {
  label: string;
  history_count: number;
  horizon: number;
  series: ForecastSeries[];
}

export interface KpiResult {
  flight_id: number;
  flight_number: string;
  route: string;
  distance_km: number;
  passengers: number;
  capacity: number;
  ask: number;
  rpk: number;
  load_factor: number;
  rask: number;
  cask: number;
  yield_val: number;
  belf: number;
  marge_rask_cask: number;
  total_revenue: number;
  total_cost: number;
  profit_margin: number;
}

export interface HistogramBin {
  label: string;
  count: number;
  center: number;
}

export interface MonteCarloResult {
  flight_id: number;
  n_sims: number;
  mean_profit: number;
  median_profit: number;
  std_profit: number;
  ci_mean_lower: number;
  ci_mean_upper: number;
  prob_loss: number;
  var_95: number;
  p025: number;
  p975: number;
  verdict: string;
  verdict_color: string;
  histogram: HistogramBin[];
}

export interface OptimizationResult {
  flight_id: number;
  results: {
    model: string;
    capacity: number;
    best_profit: number;
    best_ticket: number;
    best_pax: number;
    load_pct: number;
  }[];
  winner: {
    model: string;
    capacity: number;
    best_profit: number;
    best_ticket: number;
    best_pax: number;
    load_pct: number;
  } | null;
}
