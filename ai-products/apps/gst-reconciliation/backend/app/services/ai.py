"""DeepSeek integration (OpenAI-compatible chat-completions API).

AI is used for three bounded jobs, never for arithmetic:
  1. mapping unfamiliar document layouts to the canonical GST fields (JSON, schema-validated);
  2. plain-language explanations of the calculated exceptions (JSON, schema-validated);
  3. "chat with your documents" over a processed case (streamed Markdown).
Every return figure is computed deterministically in calculator.py / official_forms.py.
"""
from __future__ import annotations

import json
import re
from typing import Any, Iterator

from openai import OpenAI

from ..config import settings
from ..schemas import DocumentRole, MappingDecision
from .official_forms import build_official_bundle
from .parsers import compact_profile, local_mapping


MAPPING_SYSTEM_PROMPT = """
You are a GST document-layout specialist. Identify the document and map its columns to the supplied
canonical GST fields. Never calculate tax figures, invent missing columns, or silently correct source
data. A missing field must remain missing. Prefer the transaction-detail sheet over summaries, except
when the document itself is a summary or portal return. Reply with a single JSON object only.
""".strip()


EXPLANATION_SYSTEM_PROMPT = """
You explain GST reconciliation exceptions using only the supplied calculated facts. Do not create or
change an amount. Do not state a legal conclusion that is not included in the supplied context. Use
plain professional language and clearly label missing evidence as DATA NEEDED. Reply with a single
JSON object only.
""".strip()


def _schema_hint(schema: dict[str, Any]) -> str:
    return "Return JSON that validates against this JSON Schema:\n" + json.dumps(schema, separators=(",", ":"))


def _parse_json(text: str) -> dict[str, Any]:
    text = re.sub(r"^```(?:json)?|```$", "", text.strip()).strip()
    return json.loads(text)


class AIService:
    def __init__(self) -> None:
        self.enabled = settings.ai_configured
        self.model = settings.deepseek_model
        self.client = (
            OpenAI(api_key=settings.deepseek_api_key.strip(), base_url=settings.deepseek_base_url, timeout=120, max_retries=1)
            if self.enabled else None
        )

    # ------------------------------------------------------------------ low level
    def _extra(self) -> dict[str, Any]:
        return {"thinking": {"type": "disabled"}}

    def json_call(self, system: str, user: str, schema: dict[str, Any], max_tokens: int = 4000) -> dict[str, Any]:
        if not self.client:
            raise RuntimeError("DeepSeek API is not configured")
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": f"{system}\n\n{_schema_hint(schema)}"},
                {"role": "user", "content": user},
            ],
            response_format={"type": "json_object"},
            temperature=0,
            max_tokens=max_tokens,
            extra_body=self._extra(),
        )
        return _parse_json(response.choices[0].message.content or "")

    def stream_chat(self, messages: list[dict[str, str]], max_tokens: int = 1200) -> Iterator[str]:
        if not self.client:
            raise RuntimeError("DeepSeek API is not configured")
        stream = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.2,
            max_tokens=max_tokens,
            stream=True,
            extra_body=self._extra(),
        )
        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    # ------------------------------------------------------------------ jobs
    def map_document(self, profile: dict[str, Any]) -> tuple[dict[str, Any], str]:
        role = DocumentRole(profile.get("local_role", "unknown"))
        baseline = local_mapping(profile, role)
        if not self.enabled:
            baseline["notes"].append("AI disabled or API key absent; local mapping used")
            return baseline, "local"

        prompt = f"""
Local role suggestion: {role.value}
Allowed document_role values: {[r.value for r in DocumentRole]}
Candidate canonical fields: {list(baseline.get('columns', {}).keys())}
Document profile:
{compact_profile(profile)}

Return the best role, source sheet, true one-based header row, first data row, exact source column
labels (as "columns": {{canonical_field: source_label}}), transformations, confidence (0-1) and concise
notes. Use role 'unknown' if the evidence is weak.
""".strip()
        schema = MappingDecision.model_json_schema()
        failures: list[str] = []
        for attempt in (1, 2):
            try:
                validated = MappingDecision.model_validate(self.json_call(MAPPING_SYSTEM_PROMPT, prompt, schema)).model_dump(mode="json")
                if validated["confidence"] < 0.55:
                    failures.append(f"{self.model}: confidence {validated['confidence']:.2f} below threshold")
                    break
                validated["notes"].extend(failures)
                return validated, self.model
            except Exception as exc:  # malformed JSON, schema mismatch, network
                failures.append(f"{self.model} attempt {attempt}: {type(exc).__name__}")
        baseline["notes"].extend(failures)
        baseline["notes"].append("AI mapping not accepted; local mapping retained")
        return baseline, "local-fallback"

    def explain_exceptions(self, exceptions: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], str]:
        if not exceptions:
            return [], "not-needed"
        if not self.enabled:
            return [self._local_explanation(item) for item in exceptions], "local"
        schema = {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "summary": {"type": "string"},
                            "action": {"type": "string"},
                            "evidence_needed": {"type": "string"},
                        },
                        "required": ["id", "summary", "action", "evidence_needed"],
                    },
                }
            },
            "required": ["items"],
        }
        prompt = json.dumps({"exceptions": exceptions}, default=str)
        for _ in (1, 2):
            try:
                response = self.json_call(EXPLANATION_SYSTEM_PROMPT, prompt, schema)
                by_id = {str(item["id"]): item for item in response["items"]}
                return [{**item, "explanation": by_id.get(str(item["id"])) or self._local_explanation(item)["explanation"]} for item in exceptions], self.model
            except Exception:
                continue
        return [self._local_explanation(item) for item in exceptions], "local-fallback"

    def structure_official_returns(self, result: dict[str, Any]) -> tuple[dict[str, Any], str]:
        # The official GSTR-9 / 9C structure is built deterministically from the calculated result;
        # no model call is needed (and none could change a figure).
        return build_official_bundle(result), "deterministic"

    @staticmethod
    def _local_explanation(item: dict[str, Any]) -> dict[str, Any]:
        amount = item.get("amount", 0) or 0
        return {
            **item,
            "explanation": {
                "id": item.get("id", ""),
                "summary": f"{item.get('title', 'Difference')} requires review. Amount: {amount:,.2f}.",
                "action": item.get("recommended_action", "Verify source documents and approve the treatment."),
                "evidence_needed": item.get("evidence_needed", "Supporting invoice or return working"),
            },
        }


ai_service = AIService()
