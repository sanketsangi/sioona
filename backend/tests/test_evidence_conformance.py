import json
from pathlib import Path
import pytest
from app.services.evidence_anchors import resolve_anchor

CASES = json.loads((Path(__file__).resolve().parents[2] / "tests/fixtures/evidence-conformance.json").read_text())

@pytest.mark.parametrize("row", CASES)
def test_shared_codepoint_anchors(row):
    anchor = resolve_anchor(row["quote"], [("m", row["content"])])
    if row.get("match") is False:
        assert anchor is None
        return
    assert anchor and (anchor.start, anchor.end) == (row["start"], row["end"])
    assert " ".join(row["content"][anchor.start:anchor.end].split()) == row["quote"]
