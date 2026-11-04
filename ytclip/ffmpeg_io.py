"""Thin ffmpeg/ffprobe wrappers: decode audio to numpy, pipe frames to an encoder."""
from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np


class FFmpegMissing(RuntimeError):
    pass


def _tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise FFmpegMissing(
            f"{name} not found in PATH. Install ffmpeg (apt install ffmpeg / brew install ffmpeg)."
        )
    return path


def ffmpeg() -> str:
    return _tool("ffmpeg")


def ffprobe() -> str:
    return _tool("ffprobe")


@dataclass
class MediaInfo:
    duration: float
    sample_rate: int
    channels: int
    title: str | None = None
    artist: str | None = None


def probe(path: str | Path) -> MediaInfo:
    """Read duration / stream layout / tags from a media file."""
    out = subprocess.run(
        [
            ffprobe(), "-v", "error", "-print_format", "json",
            "-show_format", "-show_streams", str(path),
        ],
        capture_output=True, check=True, text=True,
    ).stdout
    data = json.loads(out)
    audio = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), {})
    fmt = data.get("format", {})
    tags = {k.lower(): v for k, v in (fmt.get("tags") or {}).items()}
    duration = float(fmt.get("duration") or audio.get("duration") or 0.0)
    return MediaInfo(
        duration=duration,
        sample_rate=int(audio.get("sample_rate") or 0),
        channels=int(audio.get("channels") or 0),
        title=tags.get("title"),
        artist=tags.get("artist"),
    )


def decode_mono(path: str | Path, sr: int = 22050) -> np.ndarray:
    """Decode any audio file to a mono float32 numpy array at `sr` Hz."""
    proc = subprocess.run(
        [
            ffmpeg(), "-v", "error", "-nostdin", "-i", str(path),
            "-map", "0:a:0", "-ac", "1", "-ar", str(sr),
            "-f", "f32le", "-acodec", "pcm_f32le", "-",
        ],
        capture_output=True, check=True,
    )
    y = np.frombuffer(proc.stdout, dtype="<f4").astype(np.float32)
    if y.size == 0:
        raise RuntimeError(f"No audio decoded from {path}")
    return y


class VideoWriter:
    """Pipe raw RGB frames into ffmpeg; mux a trimmed slice of the source audio.

    Subtitles (ASS) are burned in by libass, so Cyrillic text and karaoke tags
    render exactly as authored.
    """

    def __init__(
        self,
        out_path: str | Path,
        width: int,
        height: int,
        fps: float,
        audio_path: str | Path | None = None,
        audio_start: float = 0.0,
        audio_duration: float | None = None,
        ass_path: str | Path | None = None,
        fonts_dir: str | Path | None = None,
        crf: int = 18,
        preset: str = "medium",
        audio_bitrate: str = "192k",
        fade_audio: float = 0.0,
        extra_video_filters: Sequence[str] = (),
    ) -> None:
        self.out_path = Path(out_path)
        self.out_path.parent.mkdir(parents=True, exist_ok=True)
        self.width, self.height, self.fps = width, height, fps

        cmd: list[str] = [
            ffmpeg(), "-v", "error", "-stats", "-y", "-nostdin",
            "-f", "rawvideo", "-pix_fmt", "rgb24",
            "-s", f"{width}x{height}", "-r", f"{fps}",
            "-i", "pipe:0",
        ]
        if audio_path is not None:
            cmd += ["-ss", f"{audio_start:.4f}"]
            if audio_duration is not None:
                cmd += ["-t", f"{audio_duration:.4f}"]
            cmd += ["-i", str(audio_path)]

        vf = list(extra_video_filters)
        if ass_path is not None:
            spec = str(ass_path).replace("\\", "/").replace(":", r"\:").replace("'", r"\'")
            flt = f"ass='{spec}'"
            if fonts_dir:
                fdir = str(fonts_dir).replace("\\", "/").replace(":", r"\:").replace("'", r"\'")
                flt += f":fontsdir='{fdir}'"
            vf.append(flt)
        vf.append("format=yuv420p")
        cmd += ["-vf", ",".join(vf)]

        cmd += [
            "-c:v", "libx264", "-preset", preset, "-crf", str(crf),
            "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p",
            "-x264-params", "keyint=60:min-keyint=30:scenecut=0",
            "-movflags", "+faststart",
        ]
        if audio_path is not None:
            af = ["aresample=48000", "alimiter=limit=0.97"]
            if fade_audio > 0 and audio_duration:
                af.append(f"afade=t=in:st=0:d=0.05")
                af.append(f"afade=t=out:st={max(0.0, audio_duration - fade_audio):.3f}:d={fade_audio:.3f}")
            cmd += ["-af", ",".join(af), "-c:a", "aac", "-b:a", audio_bitrate, "-ac", "2"]
            cmd += ["-map", "0:v:0", "-map", "1:a:0"]
        cmd += ["-shortest", str(self.out_path)]

        self.cmd = cmd
        self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)

    def write(self, frame: np.ndarray) -> None:
        if frame.dtype != np.uint8:
            frame = np.clip(frame, 0, 255).astype(np.uint8)
        if frame.shape[:2] != (self.height, self.width):
            raise ValueError(f"frame shape {frame.shape} != ({self.height}, {self.width}, 3)")
        assert self.proc.stdin is not None
        self.proc.stdin.write(np.ascontiguousarray(frame).tobytes())

    def write_all(self, frames: Iterable[np.ndarray]) -> None:
        for f in frames:
            self.write(f)

    def close(self) -> None:
        assert self.proc.stdin is not None
        try:
            self.proc.stdin.close()
        except BrokenPipeError:
            pass
        code = self.proc.wait()
        err = (self.proc.stderr.read().decode("utf-8", "replace") if self.proc.stderr else "")
        if code != 0:
            raise RuntimeError(f"ffmpeg failed ({code}):\n{err}\ncmd: {' '.join(self.cmd)}")

    def __enter__(self) -> "VideoWriter":
        return self

    def __exit__(self, *exc) -> None:
        self.close()


def extract_cover(audio_path: str | Path, out_path: str | Path) -> bool:
    """Try to pull embedded cover art out of the audio file. True on success."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(
        [ffmpeg(), "-v", "error", "-y", "-nostdin", "-i", str(audio_path),
         "-an", "-map", "0:v:0", "-frames:v", "1", str(out_path)],
        capture_output=True,
    )
    return r.returncode == 0 and out_path.exists() and out_path.stat().st_size > 0


def cut_audio(
    src: str | Path,
    out_path: str | Path,
    start: float,
    duration: float,
    fade_out: float = 0.25,
    codec: str = "pcm_s16le",
    sample_rate: int = 48000,
) -> Path:
    """Cut a slice of the track, limited and faded per rules.md §3.6."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    af = ["aresample=" + str(sample_rate), "alimiter=limit=0.97", "afade=t=in:st=0:d=0.04"]
    if fade_out > 0:
        af.append(f"afade=t=out:st={max(0.0, duration - fade_out):.3f}:d={fade_out:.3f}")
    subprocess.run(
        [ffmpeg(), "-v", "error", "-y", "-nostdin",
         "-ss", f"{start:.4f}", "-t", f"{duration:.4f}", "-i", str(src),
         "-vn", "-af", ",".join(af), "-ac", "2", "-ar", str(sample_rate),
         "-c:a", codec, str(out_path)],
        check=True, capture_output=True,
    )
    return out_path


def mux(
    video: str | Path,
    audio: str | Path,
    out_path: str | Path,
    audio_bitrate: str = "192k",
    copy_video: bool = True,
) -> Path:
    """Join the silent Remotion render with the audio slice (rules.md §7.5)."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [ffmpeg(), "-v", "error", "-y", "-nostdin", "-i", str(video), "-i", str(audio)]
    cmd += ["-map", "0:v:0", "-map", "1:a:0"]
    cmd += ["-c:v", "copy"] if copy_video else ["-c:v", "libx264", "-crf", "18", "-preset", "medium"]
    cmd += ["-c:a", "aac", "-b:a", audio_bitrate, "-ac", "2", "-ar", "48000",
            "-movflags", "+faststart", "-shortest", str(out_path)]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f"mux failed: {r.stderr.decode('utf-8', 'replace')[-800:]}")
    return out_path
