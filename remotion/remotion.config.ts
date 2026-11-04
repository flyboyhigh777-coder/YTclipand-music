import { Config } from "@remotion/cli/config";

// rules.md §3.1 — vertical 9:16, H.264, yuv420p
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setCodec("h264");
Config.setCrf(18);
Config.setPixelFormat("yuv420p");
Config.setChromiumDisableWebSecurity(true);
Config.setChromiumOpenGlRenderer("swangle");
Config.setOverwriteOutput(true);
