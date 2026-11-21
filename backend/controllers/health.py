"""Kontroler gotowości backendu."""

from typing import Annotated
from fastapi import APIRouter, Depends

from backend.core.dependencies import get_health_service
from backend.services.health_service import HealthService

router = APIRouter()


@router.get("/health")
def health(service: Annotated[HealthService, Depends(get_health_service)]) -> dict:
    return service.check()
