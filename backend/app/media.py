from __future__ import annotations

import base64
import hashlib
import hmac
import io
import json
import os
import re
import uuid
from datetime import datetime
from urllib import error as urlerror
from urllib.parse import quote, urlsplit, urlunsplit
from urllib.request import Request, urlopen

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

from .database import SHANGHAI
from .schemas import MediaUploadTokenRequest


ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
COMPRESSED_IMAGE_TYPE = "image/webp"
MAX_IMAGE_EDGE = 2048
MAX_IMAGE_PIXELS = 32_000_000
DEFAULT_MAX_RESULT_BYTES = 2 * 1024 * 1024
DEFAULT_MAX_SOURCE_BYTES = 16 * 1024 * 1024
DEFAULT_UPLOAD_ENDPOINTS = {
    "z0": "https://up-z0.qiniup.com",
}
ALLOWED_CATEGORIES = {"plots", "crops", "supplies", "growth", "threats"}
UPLOAD_FOLDERS = {
    "plots": "plots",
    "crops": "crops",
    "growth": "crops",
    "supplies": "supplies",
    "threats": "threats",
}


def normalize_public_image_url(value: str | None) -> str:
    """Keep the configured custom CDN on its actually provisioned protocol.

    qn.20m.cc is currently configured as an HTTP-only Qiniu custom domain. Older
    uploads may still contain an https URL from an earlier environment setting;
    returning that URL makes browsers reject every image because the certificate
    does not match the custom domain.
    """
    url = str(value or "").strip()
    if not url:
        return ""
    try:
        parsed = urlsplit(url)
    except ValueError:
        return url
    if (
        parsed.hostname
        and parsed.hostname.lower() == "qn.20m.cc"
        and parsed.scheme.lower() == "https"
    ):
        return urlunsplit(
            ("http", parsed.netloc, parsed.path, parsed.query, parsed.fragment)
        )
    return url


def _urlsafe_base64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii")


def _env_int(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name, str(default)).strip())
    except (TypeError, ValueError):
        return default
    return value


def _clean_owner(value: str) -> str:
    cleaned = re.sub(r"[^0-9A-Za-z_-]+", "-", value).strip("-_")
    return cleaned[:80] or "general"


def _extension(filename: str, content_type: str) -> str:
    clean_name = re.split(r"[\\/]", filename)[-1]
    suffix = os.path.splitext(clean_name)[1].lower()
    expected = ALLOWED_IMAGE_TYPES[content_type]
    if content_type == "image/jpeg" and suffix in {".jpg", ".jpeg"}:
        return suffix
    if suffix == expected:
        return suffix
    return expected


def _image_limits() -> dict[str, int]:
    """Read bounded image-processing limits without relying on cloud settings."""
    return {
        # 成品限制固定不超过 2 MB，避免被误配置成更大的上传文件。
        "max_bytes": max(
            1024,
            min(_env_int("QINIU_MAX_IMAGE_BYTES", DEFAULT_MAX_RESULT_BYTES), DEFAULT_MAX_RESULT_BYTES),
        ),
        # 原图允许略大一些，才能由服务端统一缩至 2K 后再做无损编码。
        "source_max_bytes": max(
            DEFAULT_MAX_RESULT_BYTES,
            min(_env_int("QINIU_MAX_SOURCE_IMAGE_BYTES", DEFAULT_MAX_SOURCE_BYTES), 20 * 1024 * 1024),
        ),
        # 尺寸上限也固定不超过 2048 像素，保证移动端展示和存储成本。
        "max_edge": max(
            256,
            min(_env_int("QINIU_MAX_IMAGE_EDGE", MAX_IMAGE_EDGE), MAX_IMAGE_EDGE),
        ),
    }


def max_source_image_bytes() -> int:
    return _image_limits()["source_max_bytes"]


def _config() -> dict[str, str | int]:
    access_key = os.getenv("QINIU_ACCESS_KEY", "").strip()
    secret_key = os.getenv("QINIU_SECRET_KEY", "").strip()
    if not access_key or not secret_key:
        raise HTTPException(
            status_code=503,
            detail="七牛云上传尚未配置，请设置 QINIU_ACCESS_KEY 和 QINIU_SECRET_KEY",
        )
    region = os.getenv("QINIU_REGION", "z0").strip().lower() or "z0"
    upload_url = (
        os.getenv("QINIU_UPLOAD_URL", "").strip()
        or DEFAULT_UPLOAD_ENDPOINTS.get(region)
        or "https://up-z0.qiniup.com"
    )
    public_base_url = normalize_public_image_url(
        os.getenv("QINIU_PUBLIC_BASE_URL", "http://qn.20m.cc").strip().rstrip("/")
    )
    if not public_base_url:
        raise HTTPException(status_code=503, detail="请设置 QINIU_PUBLIC_BASE_URL")
    return {
        "access_key": access_key,
        "secret_key": secret_key,
        "bucket": os.getenv("QINIU_BUCKET", "upflie").strip() or "upflie",
        "region": region,
        "upload_url": upload_url,
        "public_base_url": public_base_url,
        "ttl": max(60, min(_env_int("QINIU_TOKEN_TTL", 1800), 86400)),
        "max_bytes": _image_limits()["max_bytes"],
    }


def compress_image_losslessly(source: bytes) -> tuple[bytes, int, int]:
    """Normalize an image to <=2K and encode its displayed pixels as lossless WebP.

    Resizing is only applied when the original longest edge exceeds the configured
    2K ceiling. Within that ceiling, WebP uses Pillow's true lossless mode rather
    than a quality-based JPEG/WebP re-encode.
    """
    limits = _image_limits()
    if not source:
        raise HTTPException(status_code=422, detail="图片文件为空")
    if len(source) > limits["source_max_bytes"]:
        raise HTTPException(
            status_code=413,
            detail=f"原始图片不能超过 {limits['source_max_bytes'] // (1024 * 1024)} MB",
        )

    try:
        Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
        with Image.open(io.BytesIO(source)) as opened:
            if getattr(opened, "is_animated", False):
                raise HTTPException(status_code=422, detail="暂不支持动态 GIF，请上传静态图片")
            image = ImageOps.exif_transpose(opened)
            image.load()
    except HTTPException:
        raise
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(status_code=422, detail="无法识别图片，请重新选择 JPG、PNG、WEBP 或静态 GIF") from None

    if image.width * image.height > MAX_IMAGE_PIXELS:
        raise HTTPException(status_code=413, detail="图片像素过高，请先选择更小的图片")

    if max(image.size) > limits["max_edge"]:
        image.thumbnail((limits["max_edge"], limits["max_edge"]), Image.Resampling.LANCZOS)

    if image.mode not in {"RGB", "RGBA"}:
        image = image.convert("RGBA" if "transparency" in image.info else "RGB")

    output = io.BytesIO()
    image.save(
        output,
        format="WEBP",
        lossless=True,
        method=6,
        exact=True,
    )
    compressed = output.getvalue()
    if len(compressed) > limits["max_bytes"]:
        raise HTTPException(
            status_code=413,
            detail="无损压缩后图片仍超过 2 MB，请选择构图更简单或尺寸更小的图片",
        )
    return compressed, image.width, image.height


def _multipart_body(
    fields: dict[str, str],
    filename: str,
    content_type: str,
    content: bytes,
) -> tuple[bytes, str]:
    boundary = f"----GrowGarden{uuid.uuid4().hex}"
    body = io.BytesIO()
    for key, value in fields.items():
        body.write(f"--{boundary}\r\n".encode("ascii"))
        body.write(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8"))
        body.write(value.encode("utf-8"))
        body.write(b"\r\n")
    body.write(f"--{boundary}\r\n".encode("ascii"))
    body.write(
        (
            'Content-Disposition: form-data; name="file"; '
            f'filename="{filename}"\r\n'
        ).encode("utf-8")
    )
    body.write(f"Content-Type: {content_type}\r\n\r\n".encode("ascii"))
    body.write(content)
    body.write(f"\r\n--{boundary}--\r\n".encode("ascii"))
    return body.getvalue(), boundary


def upload_compressed_image(
    category: str,
    owner_id: str,
    filename: str,
    source: bytes,
) -> dict[str, object]:
    """Compress a browser upload and relay only the normalized WebP to Qiniu."""
    compressed, width, height = compress_image_losslessly(source)
    token_data = create_upload_token(
        MediaUploadTokenRequest(
            category=category,
            owner_id=owner_id,
            filename=f"{filename}.webp",
            content_type=COMPRESSED_IMAGE_TYPE,
            size=len(compressed),
        )
    )
    request_body, boundary = _multipart_body(
        {"token": str(token_data["token"]), "key": str(token_data["key"])},
        "image.webp",
        COMPRESSED_IMAGE_TYPE,
        compressed,
    )
    request = Request(
        str(token_data["uploadUrl"]),
        data=request_body,
        method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    try:
        with urlopen(request, timeout=30) as response:
            response_body = response.read()
    except urlerror.HTTPError as exc:
        raise HTTPException(status_code=502, detail="七牛云上传失败，请稍后重试") from exc
    except OSError as exc:
        raise HTTPException(status_code=502, detail="无法连接七牛云，请检查网络或上传配置") from exc

    try:
        remote = json.loads(response_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        remote = {}
    key = remote.get("key") if isinstance(remote, dict) else None
    if key != token_data["key"]:
        raise HTTPException(status_code=502, detail="七牛云返回的图片信息无效，请重试")
    return {
        "url": token_data["publicUrl"],
        "contentType": COMPRESSED_IMAGE_TYPE,
        "size": len(compressed),
        "sourceSize": len(source),
        "width": width,
        "height": height,
    }


def create_upload_token(payload: MediaUploadTokenRequest) -> dict[str, object]:
    if payload.category not in ALLOWED_CATEGORIES:
        raise HTTPException(status_code=422, detail="不支持的图片分类")
    content_type = payload.content_type.lower().split(";", 1)[0].strip()
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=422, detail="仅支持 JPG、PNG、WEBP 或 GIF 图片")

    config = _config()
    if payload.size > config["max_bytes"]:
        raise HTTPException(
            status_code=413,
            detail=f"图片不能超过 {int(config['max_bytes']) // (1024 * 1024)} MB",
        )

    now = datetime.now(SHANGHAI)
    expires_at = int(now.timestamp()) + int(config["ttl"])
    owner = _clean_owner(payload.owner_id)
    folder = UPLOAD_FOLDERS[payload.category]
    record_folder = "/growth" if payload.category == "growth" else ""
    key = (
        f"grow/{folder}/{owner}{record_folder}/{now:%Y%m%d}/"
        f"{uuid.uuid4().hex}{_extension(payload.filename, content_type)}"
    )
    return_body = (
        '{"key":"$(key)","hash":"$(etag)","size":"$(fsize)",'
        '"mimeType":"$(mimeType)"}'
    )
    policy = {
        "scope": f"{config['bucket']}:{key}",
        "deadline": expires_at,
        "insertOnly": 1,
        "mimeLimit": ";".join(ALLOWED_IMAGE_TYPES),
        "fsizeLimit": int(config["max_bytes"]),
        "returnBody": return_body,
    }
    encoded_policy = _urlsafe_base64(
        json.dumps(policy, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    )
    digest = hmac.new(
        str(config["secret_key"]).encode("utf-8"),
        encoded_policy.encode("ascii"),
        hashlib.sha1,
    ).digest()
    token = f"{config['access_key']}:{_urlsafe_base64(digest)}:{encoded_policy}"
    public_url = f"{config['public_base_url']}/{quote(key, safe='/')}"
    return {
        "uploadUrl": config["upload_url"],
        "token": token,
        "key": key,
        "publicUrl": public_url,
        "publicBaseUrl": config["public_base_url"],
        "contentType": content_type,
        "maxBytes": int(config["max_bytes"]),
        "expiresAt": datetime.fromtimestamp(expires_at, SHANGHAI).isoformat(),
        "bucket": config["bucket"],
        "region": config["region"],
    }
