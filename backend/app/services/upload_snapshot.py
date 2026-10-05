"""Validate retained corpus against membership and immutable detection history."""
import hashlib
import json
import re
from sqlalchemy import select
from app.models.detection_run import DetectionRun
from app.models.upload import Upload
from app.schemas.ingestion import Ingestion
from app.services.uploads import upload_conversation_ids


def load_upload_snapshot(db, upload):
    if upload.status != "completed" or not isinstance(upload.payload, dict):
        raise ValueError("upload_snapshot_unavailable")
    snapshot = upload.payload.get("snapshot", upload.payload)
    if not isinstance(snapshot, dict):
        raise ValueError("upload_snapshot_unavailable")
    body = Ingestion.model_validate(snapshot)
    run_id = snapshot.get("run_id", upload.upload_id)
    if not isinstance(run_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", run_id):
        raise ValueError("upload_snapshot_unavailable")
    parent = upload if run_id == upload.upload_id else db.get(Upload, (upload.tenant_id, run_id))
    if parent is None or parent.status != "completed" or not isinstance(parent.payload, dict):
        raise ValueError("upload_snapshot_unavailable")
    digest = hashlib.sha256(json.dumps(parent.payload, sort_keys=True, ensure_ascii=False,
        separators=(",", ":")).encode()).hexdigest()
    if digest != parent.content_sha256 or upload.content_sha256 != parent.content_sha256:
        raise ValueError("upload_snapshot_unavailable")
    original = Ingestion.model_validate(parent.payload)
    if body.source != upload.source:
        raise ValueError("upload_snapshot_unavailable")
    if run_id != upload.upload_id:
        file = next((item for item in original.files or [] if item.source == upload.source), None)
        if file is None:
            raise ValueError("upload_snapshot_unavailable")
        selected = set(file.conversation_ids)
        expected_chats = [chat.model_dump(mode="json") for chat in original.conversations if chat.conversation_id in selected]
        expected_detections = [item.model_dump(mode="json") for item in original.detections if item.conversation_id in selected]
        if ([chat.model_dump(mode="json") for chat in body.conversations] != expected_chats or
                [item.model_dump(mode="json") for item in body.detections] != expected_detections):
            raise ValueError("upload_snapshot_unavailable")
    chats = {chat.conversation_id: chat for chat in body.conversations}
    detections = {item.conversation_id: item for item in body.detections}
    if (len(chats) != len(body.conversations) or len(detections) != len(body.detections)
            or chats.keys() != detections.keys()
            or set(chats) != set(upload_conversation_ids(db, upload.tenant_id, upload.upload_id))):
        raise ValueError("upload_snapshot_unavailable")
    runs = {row.conversation_id: row for row in db.scalars(select(DetectionRun).where(
        DetectionRun.tenant_id == upload.tenant_id, DetectionRun.run_id == run_id,
        DetectionRun.conversation_id.in_(chats))).all()}
    for cid, chat in chats.items():
        corpus = [[message.message_id, message.role, message.content]
                  for message in sorted(chat.messages, key=lambda message: message.message_id)]
        digest = hashlib.sha256(json.dumps(corpus, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
        item = detections[cid]
        run = runs.get(cid)
        if (digest != item.content_hash or run is None or
                (run.content_hash, run.model_version, run.prompt_version, run.output, run.coverage) !=
                (item.content_hash, item.model_version, item.prompt_version,
                 [output.model_dump() for output in item.output],
                 item.coverage.model_dump() if item.coverage is not None else None)):
            raise ValueError("upload_snapshot_unavailable")
    return body, run_id
