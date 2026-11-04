"""YTclip&music — turn a track + cover + lyrics into vertical reels.

Pipeline (see rules.md): ffmpeg cuts, Whisper times the words, numpy finds the
beat and the hook, Remotion draws the animation.
"""
__version__ = "0.1.0"

from .analysis import Analysis, analyze  # noqa: F401
from .hooks import Segment, find_hooks  # noqa: F401
from .palette import Palette, extract as extract_palette  # noqa: F401
