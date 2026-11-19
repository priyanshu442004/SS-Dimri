from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from .config import settings
from .schemas import DocumentRole
from .services.ai import ai_service
from .services.calculator import calculate
from .services.parsers import normalize_file, profile_file
from .services.reports import generate_reports
from .storage import storage


class GraphState(TypedDict, total=False):
    case_id: str
    profiles: list[dict[str, Any]]
    mappings: list[dict[str, Any]]
    normalized: list[dict[str, Any]]
    validation: list[dict[str, Any]]
    result: dict[str, Any]
    reports: list[str]
    errors: list[str]
    model_log: list[str]


def profile_node(state: GraphState) -> dict[str, Any]:
    profiles = []
    errors = list(state.get("errors", []))
    for file_record in storage.list_files(state["case_id"]):
        try:
            profile = profile_file(storage.file_path(file_record), file_record["original_name"])
            profile.update({"file_id": file_record["id"], "file_name": file_record["original_name"]})
            storage.update_file(file_record["id"], profile=profile, role=profile["local_role"], status="profiled", confidence=0.65)
            profiles.append(profile)
        except Exception as exc:
            errors.append(f"{file_record['original_name']}: {exc}")
            storage.update_file(file_record["id"], status="held", notes=[str(exc)])
    return {"profiles": profiles, "errors": errors}


def mapping_node(state: GraphState) -> dict[str, Any]:
    mappings = []
    model_log = []
    for profile in state.get("profiles", []):
        mapping, model = ai_service.map_document(profile)
        mapping.update({"file_id": profile["file_id"], "file_name": profile["file_name"]})
        role = mapping.get("document_role", "unknown")
        status = "mapped" if float(mapping.get("confidence", 0)) >= 0.65 else "review_required"
        storage.update_file(profile["file_id"], mapping=mapping, role=role, status=status, confidence=mapping.get("confidence", 0), notes=mapping.get("notes", []))
        mappings.append(mapping)
        model_log.append(f"{profile['file_name']}: {model}")
    return {"mappings": mappings, "model_log": model_log}


def normalize_node(state: GraphState) -> dict[str, Any]:
    profiles = {item["file_id"]: item for item in state.get("profiles", [])}
    normalized = []
    for mapping in state.get("mappings", []):
        file_record = storage.get_file(mapping["file_id"])
        result = normalize_file(storage.file_path(file_record), profiles[mapping["file_id"]], mapping)
        result.update({"file_id": file_record["id"], "file_name": file_record["original_name"]})
        storage.update_file(file_record["id"], normalized=result, status="normalized" if result.get("kind") != "error" else "held")
        normalized.append(result)
    return {"normalized": normalized}


def validate_node(state: GraphState) -> dict[str, Any]:
    validation = []
    role_counts: dict[str, int] = {}
    for document in state.get("normalized", []):
        role = document.get("role", "unknown")
        role_counts[role] = role_counts.get(role, 0) + 1
        if document.get("kind") == "error":
            validation.append({"level": "error", "file": document.get("file_name"), "message": document.get("error")})
        elif role == DocumentRole.unknown.value:
            validation.append({"level": "warning", "file": document.get("file_name"), "message": "Document type needs human confirmation."})
        elif document.get("kind") == "records" and document.get("record_count", 0) == 0:
            validation.append({"level": "warning", "file": document.get("file_name"), "message": "No transaction rows were extracted."})
        else:
            validation.append({"level": "passed", "file": document.get("file_name"), "message": f"Accepted as {role.replace('_', ' ')}."})
    if role_counts.get("gstr2b", 0) > 1:
        validation.append({"level": "warning", "file": "Case", "message": "Multiple GSTR-2B sources detected; review to avoid double counting."})
    required = {"outward_register", "inward_register", "gstr2b", "gstr3b_summary", "gstr1_summary"}
    for missing in sorted(required - set(role_counts)):
        validation.append({"level": "warning", "file": "Case", "message": f"DATA NEEDED: {missing.replace('_', ' ')}"})
    return {"validation": validation}


def calculation_node(state: GraphState) -> dict[str, Any]:
    case = storage.get_case(state["case_id"])
    result = calculate(case, state.get("normalized", []), state.get("validation", []))
    explanations, model = ai_service.explain_exceptions(result.get("exceptions", []))
    result["exceptions"] = explanations
    official_returns, return_model = ai_service.structure_official_returns(result)
    result["official_returns"] = official_returns
    result["ai"] = {
        "provider": "DeepSeek",
        "model": settings.deepseek_model if ai_service.enabled else "local",
        "explanation_model": model,
        "official_return_json_model": return_model,
        "mapping_models": state.get("model_log", []),
    }
    storage.save_result(state["case_id"], result)
    return {"result": result}


def report_node(state: GraphState) -> dict[str, Any]:
    reports = generate_reports(state["result"], storage.reports_dir(state["case_id"]))
    result = {**state["result"], "reports": reports}
    storage.save_result(state["case_id"], result)
    return {"result": result, "reports": reports}


def build_graph():
    builder = StateGraph(GraphState)
    builder.add_node("profile_files", profile_node)
    builder.add_node("map_layouts", mapping_node)
    builder.add_node("normalize_data", normalize_node)
    builder.add_node("validate_sources", validate_node)
    builder.add_node("calculate_returns", calculation_node)
    builder.add_node("generate_reports", report_node)
    builder.add_edge(START, "profile_files")
    builder.add_edge("profile_files", "map_layouts")
    builder.add_edge("map_layouts", "normalize_data")
    builder.add_edge("normalize_data", "validate_sources")
    builder.add_edge("validate_sources", "calculate_returns")
    builder.add_edge("calculate_returns", "generate_reports")
    builder.add_edge("generate_reports", END)
    return builder.compile()


workflow = build_graph()

