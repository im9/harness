from fastapi import FastAPI

from harness.auth.routes import router as auth_router

app = FastAPI(title="harness")
app.include_router(auth_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
