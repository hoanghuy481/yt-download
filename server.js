const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 3000;
const DOWNLOAD_DIR = path.join(__dirname, "downloads");

// ─── Setup ───────────────────────────────────────────────────────────────────

if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

// Resolve yt-dlp binary — installed via pip may not be on PATH
const YT_DLP = (() => {
  const candidates = [
    "yt-dlp",
    path.join(os.homedir(), "Library/Python/3.9/bin/yt-dlp"),
    "/usr/local/bin/yt-dlp",
    "/opt/homebrew/bin/yt-dlp",
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return "yt-dlp"; // fallback
})();

// ── yt-dlp configuration (env vars) ──────────────────────────────────────────
//
//   YTDLP_PLAYER_CLIENT  – player client(s) cho YouTube (mặc định: "android")
//     "android" — tin cậy, luôn hoạt động (360p). Với PO Token sẽ có HQ.
//     "web"    — cần PO Token web. Dễ bị chặn SABR hơn.
//
//   YTDLP_PO_TOKEN       – PO Token để mở khóa chất lượng cao
//     Định dạng: "android.gvs+XXX" hoặc "web.gvs+XXX"
//     Cách lấy: https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
//
//   YTDLP_COOKIES        – Trình duyệt để lấy cookies (e.g. "chrome")
//
//   YTDLP_EXTRA_ARGS     – Tham số yt-dlp bổ sung, phân cách bằng dấu phẩy

const YTDLP_PLAYER_CLIENT = process.env.YTDLP_PLAYER_CLIENT || "android_vr";

const extraArgsFromEnv = (process.env.YTDLP_EXTRA_ARGS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const cookieArgs = [];
const cookieBrowser = process.env.YTDLP_COOKIES || "";
if (cookieBrowser.trim()) {
  cookieArgs.push("--cookies-from-browser", cookieBrowser.trim());
}

const poToken = (process.env.YTDLP_PO_TOKEN || "").trim();

function buildClientExtractorArgs(client) {
  const parts = [`youtube:player_client=${client}`];
  if (poToken) {
    parts.push(`youtube:po_token=${poToken}`);
  }
  return parts.flatMap((p) => ["--extractor-args", p]);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeFilename(name) {
  return name.replace(/[\\/*?:"<>|]/g, "_").trim();
}

// ─── In-memory download state (progress tracking) ─────────────────────────────

const downloads = new Map(); // downloadId → { status, progress, filename, outFile, error }

/**
 * Download video to temp file with progress reporting.
 * Tries player_client fallbacks on auth errors.
 * Calls onProgress({ percent, speed, eta }) for each yt-dlp progress line.
 */
async function downloadToFile(args, downloadId, opts, onProgress) {
  if (typeof opts === "function") {
    onProgress = opts;
    opts = {};
  }
  const { mergeFormat = "mp4", outExt = "mp4" } = opts;

  const tmpPath = path.join(os.tmpdir(), `ytdl_${downloadId}`);
  const outFile = tmpPath + "." + outExt;

  const clients = [...new Set([YTDLP_PLAYER_CLIENT, ...CLIENT_FALLBACKS])];
  let lastErr;

  for (const client of clients) {
    const clientArgs = buildClientExtractorArgs(client);
    if (client !== YTDLP_PLAYER_CLIENT) {
      console.log(`[yt-dlp] Retrying download with player_client=${client} ...`);
    }

    const dlArgs = [...clientArgs, ...cookieArgs, ...extraArgsFromEnv, ...args];
    if (mergeFormat) dlArgs.push("--merge-output-format", mergeFormat);
    dlArgs.push(
      "-o", outFile,
      "--no-part",
      "--progress-template", "%(progress._percent_str)s|%(progress.total_bytes)s|%(progress.speed)s|%(progress.eta)s",
    );

    try {
      await new Promise((resolve, reject) => {
        const proc = spawn(YT_DLP, dlArgs);
        let stderr = "";

        proc.stdout.on("data", (d) => {
          const text = d.toString();
          const lines = text.split("\n").filter((l) => l.includes("|"));
          for (const line of lines) {
            const parts = line.trim().split("|");
            if (parts.length >= 4) {
              const percent = parseFloat(parts[0]) || 0;
              const total = parseInt(parts[1], 10) || null;
              const speed = parseFloat(parts[2]) || 0;
              const eta = parseInt(parts[3], 10) || 0;
              if (percent > 0 && percent < 100) {
                onProgress({ percent: Math.round(percent), total, speed, eta });
              }
            }
          }
        });

        proc.stderr.on("data", (d) => (stderr += d.toString()));

        proc.on("close", (code) => {
          if (code !== 0) {
            return reject(new Error(stderr || `yt-dlp failed (code ${code})`));
          }
          if (!fs.existsSync(outFile)) {
            return reject(new Error("File đầu ra không tìm thấy sau khi tải."));
          }
          resolve();
        });

        proc.on("error", (err) => {
          if (err.code === "ENOENT") {
            reject(new Error("yt-dlp chưa được cài. Chạy: pip install yt-dlp"));
          } else {
            reject(err);
          }
        });
      });

      onProgress({ percent: 100, downloaded: null, total: null, speed: 0, eta: 0 });
      return outFile;
    } catch (err) {
      lastErr = err;
      const msg = (err.message || "").toLowerCase();
      if (msg.includes("sign in") || msg.includes("bot") || msg.includes("age") || msg.includes("login")) {
        continue;
      }
      throw err;
    }
  }

  throw lastErr;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /  →  serve frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Client fallback: try android_vr → android → web ─────────────────────────
const CLIENT_FALLBACKS = ["android_vr", "android", "web"];

/**
 * Run yt-dlp with the given global args injected, plus any extra args.
 * Tries each player_client in CLIENT_FALLBACKS on auth-related errors.
 * Returns { stdout, stderr }.
 */
async function runYtDlpWithFallback(args) {
  const clients = [...new Set([YTDLP_PLAYER_CLIENT, ...CLIENT_FALLBACKS])];
  let lastErr;

  for (const client of clients) {
    const clientArgs = buildClientExtractorArgs(client);
    if (client !== YTDLP_PLAYER_CLIENT) {
      console.log(`[yt-dlp] Retrying with player_client=${client} ...`);
    }

    try {
      const allArgs = [...clientArgs, ...cookieArgs, ...extraArgsFromEnv, ...args];
      const proc = spawn(YT_DLP, allArgs);
      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (d) => (stdout += d.toString()));
      proc.stderr.on("data", (d) => (stderr += d.toString()));

      const result = await new Promise((resolve, reject) => {
        proc.on("close", (code) => {
          if (code === 0) resolve({ stdout, stderr });
          else reject(new Error(stderr || `yt-dlp exited with code ${code}`));
        });
        proc.on("error", (err) => {
          if (err.code === "ENOENT") {
            reject(new Error("yt-dlp chưa được cài. Chạy: pip install yt-dlp"));
          } else {
            reject(err);
          }
        });
      });

      return result;
    } catch (err) {
      lastErr = err;
      const msg = (err.message || "").toLowerCase();

      // Only retry for auth/bot-related errors
      if (msg.includes("sign in") || msg.includes("bot") || msg.includes("age") || msg.includes("login")) {
        continue;
      }
      throw err; // Non-auth error — don't retry
    }
  }

  throw lastErr;
}

// POST /api/info  →  fetch video metadata + available formats
app.post("/api/info", async (req, res) => {
  const { url } = req.body;
  if (!url?.trim()) {
    return res.status(400).json({ error: "URL không được để trống" });
  }

  try {
    const { stdout } = await runYtDlpWithFallback([
      "--dump-json",
      "--no-playlist",
      "--quiet",
      "--no-warnings",
      url.trim(),
    ]);

    const info = JSON.parse(stdout);
    const formats = info.formats || [];

    const seen = new Set();
    const qualityOptions = [];

    // Best auto option always first
    qualityOptions.push({
      format_id: "bestvideo+bestaudio/best",
      label: "🏆 Tốt nhất (tự động ghép)",
      ext: "mp4",
      resolution: "Max",
      filesize: null,
    });

    // Collect unique height options, highest first
    for (const f of [...formats].reverse()) {
      const height = f.height;
      const ext = f.ext || "mp4";
      if (!height || f.vcodec === "none" || !f.vcodec) continue;

      if (seen.has(height)) continue;
      seen.add(height);

      const parts = [`${height}p`];
      if (f.fps && f.fps > 30) parts.push(`${Math.round(f.fps)}fps`);
      parts.push(ext.toUpperCase());

      const formatSel = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;

      qualityOptions.push({
        format_id: formatSel,
        label: parts.join(" · "),
        ext: "mp4",
        resolution: `${height}p`,
        height,
        filesize: f.filesize || f.filesize_approx || null,
      });

      if (qualityOptions.length >= 10) break;
    }

    return res.json({
      title: info.title || "",
      thumbnail: info.thumbnail || "",
      duration: info.duration || 0,
      channel: info.uploader || "",
      view_count: info.view_count || 0,
      formats: qualityOptions,
      url: url.trim(),
    });
  } catch (err) {
    const msg = err.message || "";
    const msgLower = msg.toLowerCase();

    if (msg.includes("403") || msg.includes("Forbidden") || msg.includes("SABR")) {
      return res.status(400).json({
        error: "YouTube đang chặn yêu cầu từ IP máy chủ. Không thể tải video này.",
      });
    }

    // Age-restricted
    if (msgLower.includes("age") && (msgLower.includes("restrict") || msgLower.includes("confirm") || msgLower.includes("verif"))) {
      return res.status(400).json({
        error: "Video bị giới hạn độ tuổi. Cần đăng nhập để xem, nhưng máy chủ hiện không hỗ trợ cookie. Vui lòng thử video khác.",
      });
    }

    // Sign-in / bot check
    if (msgLower.includes("sign in") || msgLower.includes("bot") || msgLower.includes("login")) {
      return res.status(400).json({
        error: "Video yêu cầu đăng nhập hoặc YouTube nghi ngờ bot. Thử: (1) Dùng video khác, (2) Set YTDLP_PO_TOKEN trên Railway.",
      });
    }

    // Private / unavailable / region-locked
    if (msgLower.includes("private") || msgLower.includes("unavailable") || msgLower.includes("removed") || msgLower.includes("deleted")) {
      return res.status(400).json({ error: `Video không khả dụng: ${msg.slice(0, 200)}` });
    }

    return res.status(400).json({ error: `Không thể tải thông tin: ${msg.slice(0, 300)}` });
  }
});

// ─── Video Download (two-phase: start → progress SSE → serve file) ──────────

// POST /api/download/start  →  kick off async yt-dlp download
app.post("/api/download/start", async (req, res) => {
  const { url, format_id } = req.body;
  if (!url?.trim()) return res.status(400).json({ error: "URL không hợp lệ" });

  const formatArg = format_id || "bestvideo+bestaudio/best";
  const downloadId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Get title for filename
  let title = "video";
  try {
    const { stdout } = await runYtDlpWithFallback(["--get-title", "--no-playlist", "--quiet", url]);
    title = sanitizeFilename(stdout.trim()) || "video";
  } catch (_) {}

  const filename = `${title}.mp4`;

  downloads.set(downloadId, {
    status: "starting",
    progress: { percent: 0, speed: 0, eta: 0 },
    filename,
    outFile: null,
    error: null,
  });

  // Run download in background
  downloadToFile(
    ["--format", formatArg, "--no-playlist", url],
    downloadId,
    { mergeFormat: "mp4", outExt: "mp4" },
    (progress) => {
      const d = downloads.get(downloadId);
      if (d) {
        d.status = "downloading";
        d.progress = progress;
      }
    }
  )
    .then((outFile) => {
      const d = downloads.get(downloadId);
      if (d) {
        d.status = "done";
        d.outFile = outFile;
      }
    })
    .catch((err) => {
      const d = downloads.get(downloadId);
      if (d) {
        d.status = "error";
        d.error = err.message.slice(0, 500);
      }
    });

  return res.json({ downloadId, filename });
});

// GET /api/download/status/:id  →  one-shot JSON status (for polling / debugging)
app.get("/api/download/status/:id", (req, res) => {
  const { id } = req.params;
  const d = downloads.get(id);
  if (!d) {
    return res.status(404).json({ error: "Download không tồn tại hoặc đã hết hạn." });
  }
  return res.json({
    status: d.status,
    progress: d.progress,
    filename: d.filename,
    error: d.error,
  });
});

// GET /api/download/progress/:id  →  SSE stream of download progress
app.get("/api/download/progress/:id", (req, res) => {
  const { id } = req.params;
  const d = downloads.get(id);

  if (!d) {
    return res.status(404).json({ error: "Download không tồn tại hoặc đã hết hạn." });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Send current state immediately
  send("progress", { ...d.progress, status: d.status, filename: d.filename });

  const interval = setInterval(() => {
    const current = downloads.get(id);
    if (!current) {
      send("error", { message: "Download state lost." });
      clearInterval(interval);
      return res.end();
    }

    send("progress", {
      ...current.progress,
      status: current.status,
      filename: current.filename,
    });

    if (current.status === "done") {
      send("done", { filename: current.filename });
      clearInterval(interval);
      return res.end();
    }

    if (current.status === "error") {
      send("error", { message: current.error });
      clearInterval(interval);
      return res.end();
    }
  }, 500);

  req.on("close", () => {
    clearInterval(interval);
  });
});

// GET /api/download/file/:id  →  serve completed file, then clean up
app.get("/api/download/file/:id", (req, res) => {
  const { id } = req.params;
  const d = downloads.get(id);

  if (!d || d.status !== "done" || !d.outFile) {
    return res.status(404).json({ error: "File chưa sẵn sàng hoặc không tồn tại." });
  }

  const stat = fs.statSync(d.outFile);
  const ext = path.extname(d.outFile).toLowerCase();
  const mimeMap = { ".mp4": "video/mp4", ".mkv": "video/x-matroska", ".webm": "video/webm", ".mp3": "audio/mpeg" };

  // RFC 5987: proper UTF-8 filename encoding
  const rawName = d.filename;
  const asciiName = rawName.replace(/[^\x00-\x7F]/g, "_"); // fallback for legacy clients
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(rawName)}`
  );
  res.setHeader("Content-Type", mimeMap[ext] || "video/mp4");
  res.setHeader("Content-Length", stat.size);

  const fileStream = fs.createReadStream(d.outFile);
  fileStream.pipe(res);
  fileStream.on("end", () => {
    fs.unlink(d.outFile, () => {});
    downloads.delete(id);
  });
  fileStream.on("error", () => {
    if (!res.headersSent) res.status(500).json({ error: "Lỗi khi đọc file." });
  });
});

// ─── Audio Download ──────────────────────────────────────────────────────────

// POST /api/download-audio/start  →  kick off async audio extraction
app.post("/api/download-audio/start", async (req, res) => {
  const { url } = req.body;
  if (!url?.trim()) return res.status(400).json({ error: "URL không hợp lệ" });

  const downloadId = `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  let title = "audio";
  try {
    const { stdout } = await runYtDlpWithFallback(["--get-title", "--no-playlist", "--quiet", url]);
    title = sanitizeFilename(stdout.trim()) || "audio";
  } catch (_) {}

  const filename = `${title}.mp3`;

  downloads.set(downloadId, {
    status: "starting",
    progress: { percent: 0, speed: 0, eta: 0 },
    filename,
    outFile: null,
    error: null,
  });

  downloadToFile(
    [
      "--format", "bestaudio/best",
      "--extract-audio",
      "--audio-format", "mp3",
      "--audio-quality", "0",
      "--no-playlist",
      url.trim(),
    ],
    downloadId,
    { mergeFormat: null, outExt: "mp3" },
    (progress) => {
      const d = downloads.get(downloadId);
      if (d) {
        d.status = "downloading";
        d.progress = progress;
      }
    }
  )
    .then((outFile) => {
      const d = downloads.get(downloadId);
      if (d) {
        d.status = "done";
        d.outFile = outFile;
        d.filename = filename;
      }
    })
    .catch((err) => {
      const d = downloads.get(downloadId);
      if (d) {
        d.status = "error";
        d.error = err.message.slice(0, 500);
      }
    });

  // Use same progress/file endpoints as video, keyed by downloadId
  return res.json({ downloadId, filename });
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🎬 VidGet (Node.js) đang chạy tại http://localhost:${PORT}\n`);
});
