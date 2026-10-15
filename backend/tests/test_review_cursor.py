from datetime import datetime, timezone
from uuid import UUID
from app.models.conversation import Conversation
from app.models.signal_prediction import SignalPrediction
from app.services.review_queue import page_signals_needing_review
from app.services.feedback import record_feedback


def test_cursor_walks_all_rows_without_offset_skips_after_review(db):
    db.add_all([Conversation(tenant_id="a", conversation_id=f"c{i}", channel="upload", started_at=datetime.now(timezone.utc)) for i in range(140)])
    db.commit()
    db.add_all([SignalPrediction(id=UUID(int=i + 1), tenant_id="a", conversation_id=f"c{i}", signal_type="lead", confidence=.9, summary="Opening") for i in range(140)])
    db.commit()
    first, cursor = page_signals_needing_review(db, "a", limit=50)
    assert len(first) == 50 and cursor is not None
    for row in first:
        record_feedback(db, tenant_id="a", signal_id=row.id, feedback="correct", reviewed_by="reviewer")
    second, next_cursor = page_signals_needing_review(db, "a", limit=50, after=cursor)
    third, end = page_signals_needing_review(db, "a", limit=50, after=next_cursor)
    assert len(second) == 50 and len(third) == 40 and end is None
    assert len({row.id for row in first + second + third}) == 140
    assert page_signals_needing_review(db, "b")[0] == []
    assert page_signals_needing_review(db, "a", conversation_ids=[])[0] == []
    assert len(page_signals_needing_review(db, "a", conversation_ids=["c139"])[0]) == 1


def test_review_page_rejects_bad_cursor_and_cross_tenant(client):
    url = "/v1/tenants/a/signals/needs-review/page"
    headers = {"X-Tenant-Id": "a"}
    assert client.get(url, headers=headers).json() == {"predictions": [], "next_cursor": None}
    assert client.get(url + "?after=invalid", headers=headers).status_code == 400
    assert client.get(url, headers={"X-Tenant-Id": "b"}).status_code == 403


def test_cursor_query_uses_index_and_database_limit(db):
    from sqlalchemy import event
    captured = []
    def capture(conn, cursor, statement, parameters, context, executemany):
        if statement.startswith("SELECT signal_predictions."):
            captured.append((statement, parameters))
    engine = db.get_bind()
    event.listen(engine, "before_cursor_execute", capture)
    try:
        page_signals_needing_review(db, "a", limit=20)
    finally:
        event.remove(engine, "before_cursor_execute", capture)
    statement, parameters = captured[0]
    assert "LIMIT" in statement
    assert 21 in parameters
    plan = db.connection().exec_driver_sql("EXPLAIN QUERY PLAN " + statement, parameters).all()
    details = " ".join(str(row[-1]) for row in plan)
    assert "ix_prediction_tenant_active_id" in details
    # Existing unique signal_id index resolves the correlated feedback probe.
    assert "signal_feedback" in details and "INDEX" in details


def test_tenant_signal_page_is_bounded_with_feedback_and_empty_scope(client):
    headers = {"X-Tenant-Id": "a"}
    for i in range(3):
        response = client.post("/v1/predictions", headers=headers, json={
            "conversation_id": f"c{i}", "signal_type": "lead", "confidence": .9, "summary": "Opening"})
        assert response.status_code == 201
    url = "/v1/tenants/a/signals/page?limit=2"
    first = client.get(url, headers=headers).json()
    assert len(first["predictions"]) == 2 and first["next_cursor"]
    second = client.get(url + "&after=" + first["next_cursor"], headers=headers).json()
    assert len(second["predictions"]) == 1 and second["next_cursor"] is None
    assert len({row["id"] for row in first["predictions"] + second["predictions"]}) == 3
    assert client.get(url + "&conversation_id=", headers=headers).json()["predictions"] == []
    assert client.get(url + "&after=bad", headers=headers).status_code == 400
    assert client.get(url, headers={"X-Tenant-Id": "b"}).status_code == 403


def test_search_customer_text_summary_scope_and_cursor(db):
    from app.models.message import Message
    now = datetime.now(timezone.utc)
    for tenant in ('a', 'b'):
        for i in range(4):
            db.add(Conversation(tenant_id=tenant, conversation_id=f'c{i}', channel='upload', started_at=now))
            db.add(SignalPrediction(id=UUID(int=(1 if tenant == 'a' else 100) + i), tenant_id=tenant,
                conversation_id=f'c{i}', signal_type='lead', confidence=.9,
                summary='renewal opportunity' if i == 0 else 'ordinary'))
            db.add(Message(tenant_id=tenant, conversation_id=f'c{i}', message_id=f'm{i}',
                role='agent' if i == 2 else 'customer', timestamp=now,
                content='renewal 50%_discount' if i in (1, 2) else 'ordinary'))
    db.commit()
    first, cursor = page_signals_needing_review(db, 'a', q=' renewal ', limit=1)
    second, end = page_signals_needing_review(db, 'a', q='renewal', limit=1, after=cursor)
    assert [r.conversation_id for r in first + second] == ['c0', 'c1']
    assert end is None
    assert page_signals_needing_review(db, 'a', q='%_')[0][0].conversation_id == 'c1'
    assert page_signals_needing_review(db, 'a', q='missing')[0] == []
    assert page_signals_needing_review(db, 'a', q='renewal', conversation_ids=['c2'])[0] == []
    assert len(page_signals_needing_review(db, 'a', q='  ')[0]) == 4


def test_search_route_validation(client):
    headers = {'X-Tenant-Id': 'a'}
    path = '/v1/tenants/a/signals/needs-review/page'
    assert client.get(path, params={'q': 'x' * 201}, headers=headers).status_code == 422
    assert client.get(path, params={'q': "' OR true --"}, headers=headers).json()['predictions'] == []


def test_access_log_excludes_search_text():
    import logging
    from app.access_logging import RedactQueryString
    record = logging.LogRecord('uvicorn.access', logging.INFO, '', 0, '%s - "%s %s HTTP/%s" %d',
        ('local', 'GET', '/signals/needs-review/page?q=private-search', '1.1', 200), None)
    assert RedactQueryString().filter(record)
    assert 'private-search' not in record.getMessage()
    assert '/signals/needs-review/page' in record.getMessage()


def test_search_is_applied_to_both_page_routes(client):
    headers = {'X-Tenant-Id': 'a'}
    for i, summary in enumerate(('renewal opportunity', 'ordinary')):
        assert client.post('/v1/predictions', headers=headers, json={
            'conversation_id': f'c{i}', 'signal_type': 'lead',
            'confidence': .9, 'summary': summary}).status_code == 201
    for path in ('signals/needs-review/page', 'signals/page'):
        response = client.get(f'/v1/tenants/a/{path}', headers=headers, params={'q': 'renewal'})
        assert response.status_code == 200
        assert [row['conversation_id'] for row in response.json()['predictions']] == ['c0']
