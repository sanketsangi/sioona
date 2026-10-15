"""Migration ancestry is checked offline, before any database is touched."""
from pathlib import Path
from alembic.config import Config
from alembic.script import ScriptDirectory


def test_jobs_follows_complete_rls_on_one_linear_head():
    root = Path(__file__).resolve().parents[1]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))
    scripts = ScriptDirectory.from_config(cfg)
    assert scripts.get_heads() == ["033_supervised_action_executions"]
    assert scripts.get_revision("033_supervised_action_executions").down_revision == "032_live_ingest"
    assert scripts.get_revision("032_live_ingest").down_revision == "031_queue_search"
    assert "031_queue_search" in {revision.revision for revision in scripts.walk_revisions()}
    assert scripts.get_revision("031_queue_search").down_revision == "030_inference_control_audit"
    assert scripts.get_revision("030_inference_control_audit").down_revision == "029_audit_lifecycle"
    assert scripts.get_revision("029_audit_lifecycle").down_revision == "028_batch_cache"
    assert scripts.get_revision("028_batch_cache").down_revision == "027_jobs"
    assert scripts.get_revision("027_jobs").down_revision == "027_complete_tenant_rls"
    assert scripts.get_revision("027_complete_tenant_rls").down_revision == "026_weekly_upload_receipts"
    assert all(not isinstance(revision.down_revision, tuple)
               for revision in scripts.walk_revisions())
