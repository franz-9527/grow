"""Check the exact Git index before committing or publishing. Never print secrets."""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def git(*args: str) -> bytes:
    return subprocess.check_output(["git", "-c", f"safe.directory={ROOT.as_posix()}", *args], cwd=ROOT)


PATTERNS = [
    ("private key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")),
    ("GitHub token", re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b")),
    ("cloud access key", re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b")),
    ("credential in URL", re.compile(r"https?://[^\s/:]+:[^\s/@]+@")),
    ("personal hosting ID", re.compile(r"appgprj_[a-f0-9]{20,}")),
    ("BaoTa webhook capability", re.compile(r"https?://[^\s\"']+(?:hook\?access_key=|webhook[^\s\"']*[?&](?:key|token)=)[A-Za-z0-9_-]{12,}")),
    ("assigned secret", re.compile(r"(?im)^[ \t]*(?:QINIU_ACCESS_KEY|QINIU_SECRET_KEY|GROW_ADMIN_SESSION_SECRET|GROW_WEBHOOK_SECRET|BT_WEBHOOK_URL|GITHUB_TOKEN|GH_TOKEN|AWS_SECRET_ACCESS_KEY)[ \t]*=[ \t]*['\"]?[^\s'\"#][^\r\n]{7,}")),
]


def main() -> int:
    paths = [p.decode("utf-8") for p in git("ls-files", "-z").split(b"\0") if p]
    problems = []
    total = 0
    for name in paths:
        path = Path(name)
        forbidden = (
            (path.name.startswith(".env") and path.name != ".env.example")
            or path.suffix.lower() in {".db", ".sqlite", ".sqlite3", ".pem", ".key", ".pfx", ".p12", ".zip", ".sql"}
            or name.startswith((".local-backups/", "backend/data/backups/", "deploy/archive/", "deploy/release-", "截屏/"))
            or name == "frontend/.openai/hosting.json"
        )
        if forbidden:
            problems.append(f"{name}: private/runtime file is tracked")
            continue
        body = git("show", f":{name}")
        total += len(body)
        if b"\0" in body:
            continue
        content = body.decode("utf-8", errors="replace")
        for label, pattern in PATTERNS:
            for match in pattern.finditer(content):
                line = content.count("\n", 0, match.start()) + 1
                problems.append(f"{name}:{line}: {label}")
    if problems:
        print("Public upload blocked (values redacted):\n" + "\n".join(problems))
        return 1
    print(f"Public-file checks passed: {len(paths)} indexed files, {total:,} bytes. Review unrecognized credential formats manually.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
