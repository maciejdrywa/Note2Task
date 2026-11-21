"""Jedno miejsce mapowania błędów aplikacji na odpowiedzi HTTP."""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from backend.core.exceptions import InvalidModelResponse, OllamaUnavailable


def register_error_handlers(app: FastAPI) -> None:
    async def handle_error(request: Request, exc: Exception) -> JSONResponse:
        if isinstance(exc, OllamaUnavailable):
            status = 503
        elif isinstance(exc, TimeoutError):
            status = 504
        else:
            status = 502
        return JSONResponse(status_code=status, content={"detail": str(exc)})

    for error in (OllamaUnavailable, TimeoutError, InvalidModelResponse):
        app.add_exception_handler(error, handle_error)
