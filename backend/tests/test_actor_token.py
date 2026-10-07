"""Web-shaped HS256 assertions decode with the single current key."""

import base64
import hashlib
import hmac
import json
import time

import jwt
import pytest

from app.api.actor import ActorTokenError, decode_actor_token
from app.config import get_settings

KEY = "test-actor-key-at-least-32-bytes!"


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def sign_like_web(
    sub: str,
    tid: str,
    key: str = KEY,
    *,
    iat: int | None = None,
    exp: int | None = None,
    iss: str = "sioona-web",
    aud: str = "sioona-api",
    jti: str = "11111111-1111-4111-8111-111111111111",
    alg: str = "HS256",
) -> str:
    issued = int(time.time()) if iat is None else iat
    expires = issued + 60 if exp is None else exp
    header = _b64(json.dumps({"alg": alg, "typ": "JWT"}, separators=(",", ":")).encode())
    payload = _b64(
        json.dumps(
            {"iss": iss, "aud": aud, "sub": sub, "tid": tid, "iat": issued, "exp": expires, "jti": jti},
            separators=(",", ":"),
        ).encode()
    )
    signing_input = f"{header}.{payload}".encode()
    if alg == "none":
        return f"{header}.{payload}."
    signature = hmac.new(key.encode(), signing_input, hashlib.sha256).digest()
    return f"{header}.{payload}.{_b64(signature)}"


def test_web_shaped_token_carries_the_approved_claims() -> None:
    token = sign_like_web("4f79ac56-3a83-5f2a-b143-dafc406b7c28", "tenant_partner")
    claims = decode_actor_token(token, KEY)
    assert claims["iss"] == "sioona-web"
    assert claims["aud"] == "sioona-api"
    assert claims["sub"] == "4f79ac56-3a83-5f2a-b143-dafc406b7c28"
    assert claims["tid"] == "tenant_partner"
    assert claims["exp"] - claims["iat"] == 60
    assert claims["jti"]


@pytest.mark.parametrize(
    "mutate",
    [
        {"key": "other-key"},
        {"expired": True},
        {"aud": "elsewhere"},
        {"iss": "not-sioona"},
        {"alg": "none"},
    ],
)
def test_bad_signature_expiry_audience_and_issuer_fail(mutate) -> None:
    now = int(time.time())
    exp = now - 5 if mutate.get("expired") else now + 60
    iat = exp - 60
    key = mutate.get("key", KEY)
    token = sign_like_web(
        "user",
        "tenant_partner",
        key if mutate.get("alg") != "none" else KEY,
        exp=exp,
        iat=iat,
        aud=mutate.get("aud", "sioona-api"),
        iss=mutate.get("iss", "sioona-web"),
        alg=mutate.get("alg", "HS256"),
    )
    with pytest.raises(ActorTokenError) as caught:
        decode_actor_token(token, KEY)
    assert caught.value.reason == "invalid_actor"


def test_empty_key_fails_closed() -> None:
    token = sign_like_web("user", "tenant_partner")
    with pytest.raises(ActorTokenError) as caught:
        decode_actor_token(token, "")
    assert caught.value.reason == "actor_key_unconfigured"


def test_actor_auth_mode_defaults_off_and_reads_the_flag(monkeypatch) -> None:
    monkeypatch.delenv("SIOONA_ACTOR_AUTH", raising=False)
    get_settings.cache_clear()
    assert get_settings().sioona_actor_auth_mode == "off"
    monkeypatch.setenv("SIOONA_ACTOR_AUTH", "shadow")
    get_settings.cache_clear()
    assert get_settings().sioona_actor_auth_mode == "shadow"
    get_settings.cache_clear()


def test_pyjwt_rejects_a_previous_key() -> None:
    token = jwt.encode(
        {
            "iss": "sioona-web",
            "aud": "sioona-api",
            "sub": "user",
            "tid": "tenant_partner",
        "iat": int(time.time()),
        "exp": int(time.time()) + 60,
            "jti": "11111111-1111-4111-8111-111111111111",
        },
        "previous-actor-key-32-bytes-long!",
        algorithm="HS256",
    )
    with pytest.raises(ActorTokenError):
        decode_actor_token(token, KEY)
