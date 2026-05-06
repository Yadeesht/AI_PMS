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
        "occupancy": get_occupancy.invoke({}),
        "revenue": get_revenue_summary.invoke({}),
        "maintenance": get_maintenance_tickets.invoke({}),
    }


@app.post("/chat")
async def chat(request: ChatRequest):
    response = agent.invoke({"messages": [HumanMessage(request.message)]})
    return {"reply": response["messages"][-1].content}


@app.post("/documents/upload")
async def upload_doc(file: UploadFile = File(...)):
    await file.read()
    result = document_qa.invoke({"query": file.filename})
    return {"filename": file.filename, "extracted_fields": result}
