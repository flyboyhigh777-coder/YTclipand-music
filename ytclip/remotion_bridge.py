"""The only place that shells out to Remotion (rules.md §6.3)."""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

REMOTION_DIR = Path(__file__).resolve().parent.parent / "remotion"
ENTRY = "src/index.ts"

# This container ships a headless Chromium with Playwright (rules.md §7.4)
DEFAULT_BROWSERS = (
    "/opt/pw-browsers/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
)


class RemotionMissing(RuntimeError):
    pass


def find_browser() -> str | None:
    env = os.environ.get("REMOTION_BROWSER_EXECUTABLE")
    if env and Path(env).exists():
        return env
    for cand in DEFAULT_BROWSERS:
        if Path(cand).exists():
            return cand
    return shutil.which("chromium") or shutil.which("google-chrome")


def ensure_installed(remotion_dir: Path = REMOTION_DIR) -> None:
    if not (remotion_dir / "node_modules" / "remotion").exists():
        raise RemotionMissing(
            f"Remotion is not installed. Run:\n  npm install --prefix {remotion_dir}"
        )
    if not shutil.which("npx"):
        raise RemotionMissing("Node.js / npx not found in PATH (need Node 18+).")


def render(
    composition: str,
    props: dict | Path,
    out_path: str | Path,
    *,
    remotion_dir: Path = REMOTION_DIR,
    concurrency: int | None = None,
    jpeg_quality: int = 95,
    image_format: str = "jpeg",
    log: str = "error",
    timeout: int = 3600,
    verbose: bool = True,
) -> Path:
    """Render one composition to a silent video file (audio is muxed later by ffmpeg)."""
    ensure_installed(remotion_dir)
    out_path = Path(out_path).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if isinstance(props, dict):
        props_path = out_path.with_suffix(".props.json")
        payload = {k: v for k, v in props.items() if not k.startswith("_")}
        props_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    else:
        props_path = Path(props).resolve()

    cmd = [
        "npx", "remotion", "render", ENTRY, composition, str(out_path),
        f"--props={props_path}",
        f"--image-format={image_format}",
        f"--jpeg-quality={jpeg_quality}",
        f"--log={log}",
        "--codec=h264",
        "--crf=18",
        # jpeg frames make x264 pick yuvj420p (full range), which looks washed
        # out or crushed on players that honour the flag — pin the broadcast
        # pixel format and colour space instead (rules.md §3.1)
        "--pixel-format=yuv420p",
        "--color-space=bt709",
        "--disable-web-security",
        "--gl=swangle",
        "--muted",
    ]
    if concurrency:
        cmd.append(f"--concurrency={concurrency}")

    browser = find_browser()
    if browser:
        # Without this Remotion downloads its own Chrome from remotion.media,
        # which fails on networks that only allow package registries.
        cmd.append(f"--browser-executable={browser}")
        cmd.append("--chrome-mode=chrome-for-testing")
    else:
        raise RemotionMissing(
            "No Chrome/Chromium found. Set REMOTION_BROWSER_EXECUTABLE to a Chrome binary."
        )

    env = dict(os.environ)
    if browser:
        env["REMOTION_BROWSER_EXECUTABLE"] = browser
    env.setdefault("REMOTION_CHROME_FLAGS", "--no-sandbox --disable-dev-shm-usage")

    if verbose:
        print(f"  remotion render {composition} -> {out_path.name}")
    proc = subprocess.run(
        cmd, cwd=str(remotion_dir), env=env,
        capture_output=True, text=True, timeout=timeout,
    )
    if proc.returncode != 0:
        tail = "\n".join((proc.stderr or proc.stdout or "").splitlines()[-40:])
        raise RuntimeError(f"Remotion render failed ({proc.returncode}):\n{tail}")
    if not out_path.exists():
        raise RuntimeError(f"Remotion reported success but {out_path} is missing")
    return out_path


def list_compositions(remotion_dir: Path = REMOTION_DIR) -> list[str]:
    ensure_installed(remotion_dir)
    proc = subprocess.run(
        ["npx", "remotion", "compositions", ENTRY, "--log=error"],
        cwd=str(remotion_dir), capture_output=True, text=True,
    )
    if proc.returncode != 0:
        return []
    out: list[str] = []
    for line in proc.stdout.splitlines():
        tok = line.strip().split()
        if tok and re.fullmatch(r"[A-Za-z0-9_-]+", tok[0]):
            out.append(tok[0])
    return out
