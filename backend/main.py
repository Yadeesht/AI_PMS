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


def _normalize_reply(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
                continue
            if isinstance(part, dict):
                text = part.get("text") or part.get("content")
                if text:
                    parts.append(str(text))
        joined = "\n".join(parts).strip()
        return joined or str(content)
    return str(content)


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
    reply = _normalize_reply(response["messages"][-1].content)
    return {"reply": reply}


@app.post("/documents/upload")
async def upload_doc(file: UploadFile = File(...)):
    await file.read()
    result = document_qa.invoke({"query": file.filename})
    return {"filename": file.filename, "extracted_fields": result}
