from fastapi import FastAPI

from harness.auth.routes import router as auth_router
from harness.dashboard import router as dashboard_router
from harness.dashboard import ws_router as dashboard_ws_router
from harness.help import router as help_router
from harness.settings import router as settings_router

app = FastAPI(title="harness")
app.include_router(auth_router)
app.include_router(settings_router)
app.include_router(help_router)
app.include_router(dashboard_router)
app.include_router(dashboard_ws_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
