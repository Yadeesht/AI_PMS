import os

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import HumanMessage
from pydantic import BaseModel

from agent import (
    build_agent,
    document_qa,
    get_maintenance_tickets,
    get_occupancy,
    get_revenue_summary,
)

app = FastAPI()
agent = build_agent()

origins_env = os.getenv("CORS_ORIGINS", "*")
allow_origins = [origin.strip() for origin in origins_env.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/dashboard")
async def dashboard():
    return {
        "occupancy": get_occupancy(),
        "revenue": get_revenue_summary(),
        "maintenance": get_maintenance_tickets(),
    }


@app.post("/chat")
async def chat(request: ChatRequest):
    response = agent.invoke({"messages": [HumanMessage(request.message)]})
    return {"reply": response["messages"][-1].content}


@app.post("/documents/upload")
async def upload_doc(file: UploadFile = File(...)):
    await file.read()
    result = document_qa(query=file.filename)
    return {"filename": file.filename, "extracted_fields": result}
