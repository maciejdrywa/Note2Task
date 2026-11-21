"""Endpoint tworzący wydarzenia z notatki w kalendarzu konta demonstracyjnego."""

from typing import Annotated
from fastapi import APIRouter, Depends, Response

from backend.core.dependencies import get_scheduling_service
from backend.models.requests import ExtractRequest
from backend.models.scheduling import ScheduleResponse
from backend.services.scheduling_service import SchedulingService

router = APIRouter()


@router.post(
    "/schedule", response_model=ScheduleResponse, response_model_exclude_none=True,
    responses={207: {"model": ScheduleResponse, "description": "Write failed or outcome unknown; inspect results."}},
)
def schedule(
    request: ExtractRequest, response: Response,
    service: Annotated[SchedulingService, Depends(get_scheduling_service)],
) -> ScheduleResponse:
    result = service.schedule(request.text)
    if result.status != "completed":
        response.status_code = 207
    return result
