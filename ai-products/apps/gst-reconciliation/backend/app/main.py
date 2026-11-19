from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse, StreamingResponse

from .config import settings
from .graph import workflow
from .schemas import CaseCreate, FinancialInputs
from .services.ai import ai_service
from .services.chat import MAX_HISTORY, SUGGESTIONS, load_chat, save_chat, system_prompt
from .storage import storage


# Served by nginx under /app/gst-reconciliation/api/* -> this app's /api/* (same origin, no CORS needed).
app = FastAPI(title="GST Reconciliation", version="1.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
ALLOWED = {".xlsx", ".xlsm", ".csv", ".pdf"}
MAX_FILE_MB = 25


def _case_or_404(case_id: str) -> dict:
    try:
        return storage.get_case(case_id)
    except KeyError:
        raise HTTPException(404, "Case not found")


@app.get("/api/health")
def health():
    return {"status": "ok", "ai_configured": ai_service.enabled, "provider": "DeepSeek", "model": settings.deepseek_model}


@app.get("/api/settings")
def settings_status():
    return {
        **health(),
        "limits": {"maxFileMb": MAX_FILE_MB, "formats": ["XLSX / XLSM", "CSV", "PDF (text-based)"]},
        "version": app.version,
    }


@app.post("/api/cases")
def create_case(payload: CaseCreate):
    return storage.create_case(payload)


@app.get("/api/cases")
def list_cases():
    return storage.list_cases()


@app.get("/api/cases/{case_id}")
def get_case(case_id: str):
    case = _case_or_404(case_id)
    return {**case, "files": storage.list_files(case_id), "runs": storage.list_runs(case_id)}


@app.post("/api/cases/{case_id}/files")
async def upload_files(case_id: str, files: list[UploadFile] = File(...)):
    _case_or_404(case_id)
    for upload in files:
        if Path(upload.filename or "").suffix.lower() not in ALLOWED:
            raise HTTPException(400, f"Unsupported file: {upload.filename}. Upload Excel, CSV or PDF.")
        if upload.size and upload.size > MAX_FILE_MB * 1024 * 1024:
            raise HTTPException(413, f"{upload.filename} is larger than {MAX_FILE_MB} MB.")
    uploaded = [await storage.save_upload(case_id, upload) for upload in files]
    storage.update_case(case_id, status="Files uploaded")
    return uploaded


@app.delete("/api/cases/{case_id}/files/{file_id}")
def delete_file(case_id: str, file_id: str):
    _case_or_404(case_id)
    try:
        record = storage.get_file(file_id)
    except KeyError:
        raise HTTPException(404, "File not found")
    if record["case_id"] != case_id:
        raise HTTPException(404, "File not found")
    storage.delete_file(file_id)
    return {"ok": True}


@app.post("/api/cases/{case_id}/financial-inputs")
def update_financial_inputs(case_id: str, payload: FinancialInputs):
    _case_or_404(case_id)
    storage.save_financial_inputs(case_id, payload)
    return {"status": "saved", "financial_inputs": payload}


@app.post("/api/cases/{case_id}/run")
def run_case(case_id: str):
    _case_or_404(case_id)
    if not storage.list_files(case_id):
        raise HTTPException(400, "Upload at least one source file before running the analysis")
    run_id = storage.create_run(case_id, settings.deepseek_model if ai_service.enabled else "local")
    storage.update_case(case_id, status="Running")
    try:
        final_state = workflow.invoke({"case_id": case_id, "errors": []})
        result = final_state["result"]
        storage.finish_run(run_id, "completed", result)
        return {"run_id": run_id, "result": result}
    except Exception as exc:
        storage.finish_run(run_id, "failed", {"error": str(exc)})
        storage.update_case(case_id, status="Failed")
        raise HTTPException(500, f"Analysis failed: {exc}")


@app.get("/api/cases/{case_id}/results")
def get_results(case_id: str):
    return _case_or_404(case_id)["result"]


@app.get("/api/cases/{case_id}/reports/{filename}")
def download_report(case_id: str, filename: str):
    safe_name = Path(filename).name
    path = storage.reports_dir(case_id) / safe_name
    if not path.exists():
        raise HTTPException(404, "Report not found")
    return FileResponse(path, filename=safe_name)


# ------------------------------------------------------------------ chat with the case documents
# Same contract as apps/_shared/server/chat.js (a "run" here is a case).
@app.get("/api/chat/suggestions")
def chat_suggestions():
    return {"suggestions": SUGGESTIONS}


@app.get("/api/runs/{case_id}/chat")
def chat_history(case_id: str):
    _case_or_404(case_id)
    return {"messages": load_chat(case_id)}


@app.post("/api/runs/{case_id}/chat/reset")
def chat_reset(case_id: str):
    _case_or_404(case_id)
    save_chat(case_id, [])
    return {"ok": True}


@app.post("/api/runs/{case_id}/chat")
async def chat(case_id: str, request: Request):
    _case_or_404(case_id)
    body = await request.json()
    question = str(body.get("message") or "").strip()[:2000]
    if not question:
        raise HTTPException(400, "Empty message")
    if not ai_service.enabled:
        raise HTTPException(503, "The AI assistant is not configured on this server.")
    if not storage.list_files(case_id):
        raise HTTPException(400, "Upload documents to this case before chatting.")
    system = system_prompt(case_id)
    history = load_chat(case_id)
    messages = [{"role": "system", "content": system}, *[{"role": m["role"], "content": m["content"]} for m in history[-MAX_HISTORY:]], {"role": "user", "content": question}]

    def events():
        full = ""
        try:
            for delta in ai_service.stream_chat(messages):
                full += delta
                yield f"data: {json.dumps({'delta': delta})}\n\n"
            at = datetime.now(timezone.utc).isoformat()
            save_chat(case_id, [*history, {"role": "user", "content": question, "at": at}, {"role": "assistant", "content": full, "at": at}])
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as exc:
            print("chat:", repr(exc), flush=True)
            yield f"data: {json.dumps({'error': 'The assistant is unavailable right now. Please try again.'})}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"})


@app.get("/api/runs/{case_id}/transcript")
def chat_transcript(case_id: str):
    case = _case_or_404(case_id)
    lines = [f"# GST Reconciliation — {case['legal_name']} (FY {case['financial_year']})", ""]
    for m in load_chat(case_id):
        lines.append(f"## {'You' if m['role'] == 'user' else 'GST Assistant'}\n\n{m['content']}\n")
    return PlainTextResponse("\n".join(lines), media_type="text/markdown; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="gst_chat_{case_id}.md"'})
