from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS
from app.database import initialize_database
from app.routers import (
    aircraft,
    airports,
    auth,
    chatbot,
    dashboard,
    decision,
    flights,
    forecast,
    simulation,
    users,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield


app = FastAPI(
    title="RAM Flight Cost Calculator API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (
    auth.router,
    aircraft.router,
    airports.router,
    flights.router,
    dashboard.router,
    simulation.router,
    forecast.router,
    decision.router,
    users.router,
    chatbot.router,
):
    app.include_router(router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "RAM Flight Cost Calculator"}
