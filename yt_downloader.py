#!/usr/bin/env python3
"""
YouTube 4K Downloader — sử dụng yt-dlp Python API với android_vr client.

Cài đặt môi trường:
    pip install yt-dlp
    # ffmpeg phải có sẵn trong PATH (brew install ffmpeg / apt install ffmpeg)

Cách dùng:
    python3 yt_downloader.py "https://www.youtube.com/watch?v=LXb3EKWsInQ"
    python3 yt_downloader.py "https://www.youtube.com/watch?v=LXb3EKWsInQ" --audio  # chỉ tải MP3
"""

import argparse
import os
import sys

import yt_dlp


# ─── Progress Hook ────────────────────────────────────────────────────────────

def progress_hook(d):
    """Hiển thị tiến trình tải ra terminal."""
    if d["status"] == "downloading":
        # Dạng màn hình:  ████████░░░░  47.6%  |  3.2 MiB/s  |  ETA 00:12
        pct_str = d.get("_percent_str", "  ?%").strip()
        speed_str = d.get("_speed_str", "?").strip()
        eta_str = d.get("_eta_str", "?").strip()

        # Vẽ thanh progress đơn giản
        try:
            pct = float(pct_str.replace("%", ""))
            bar_len = 30
            filled = int(bar_len * pct / 100)
            bar = "█" * filled + "░" * (bar_len - filled)
        except ValueError:
            bar = "?" * 30
            pct = 0

        print(f"\r  {bar}  {pct_str:>6s}  |  {speed_str:>10s}  |  ETA {eta_str}", end="")
        sys.stdout.flush()

    elif d["status"] == "finished":
        print(f"\r  {'█' * 30}  100.0%  |  Hoàn tất tải xuống." + " " * 15)
        # Giai đoạn post-processing (ghép audio/video bởi ffmpeg)
        if d.get("postprocessing"):
            print("  [ffmpeg] Đang ghép video + audio ...")


# ─── Core Downloader ──────────────────────────────────────────────────────────

def download_video(url: str, output_dir: str = ".", audio_only: bool = False):
    """
    Tải video YouTube ở độ phân giải cao nhất có thể (tối đa 4K).

    Args:
        url: Link YouTube cần tải.
        output_dir: Thư mục lưu file đầu ra.
        audio_only: Nếu True, chỉ trích xuất âm thanh MP3 320kbps.
    """

    # ── Đường dẫn file đầu ra ─────────────────────────────────────────────────
    outtmpl = os.path.join(output_dir, "%(title).100s.%(ext)s")

    # ── Cấu hình format ───────────────────────────────────────────────────────
    if audio_only:
        # Chỉ tải âm thanh, convert sang MP3 320kbps
        format_str = "bestaudio/best"
        postprocessors = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "320",
        }]
        merge_output_format = None
    else:
        # Tải video chất lượng cao nhất tối đa 4K (2160p) + âm thanh tốt nhất
        # bestvideo[height<=2160]: video tốt nhất không vượt quá 2160p
        # +bestaudio: ghép với audio tốt nhất
        # /best: fallback nếu không có luồng riêng (các video cũ)
        format_str = "bestvideo[height<=2160]+bestaudio/best"
        postprocessors = []
        merge_output_format = "mp4"

    # ── Cấu hình yt-dlp ───────────────────────────────────────────────────────
    ydl_opts = {
        # ---- Format & Output ----
        "format": format_str,
        "outtmpl": outtmpl,
        "merge_output_format": merge_output_format,

        # ---- Bypass SABR / PO Token ----
        # Sử dụng android_vr (Virtual Reality) client để né cơ chế SABR streaming.
        # Khác với android thường (chỉ có 360p), android_vr có toàn bộ định dạng
        # từ 144p đến 2160p60 HDR mà không cần PO Token.
        "extractor_args": {
            "youtube": {
                "player_client": ["android_vr"],
            }
        },

        # ---- Progress ----
        "progress_hooks": [progress_hook],
        # Không log các dòng info thừa (chỉ giữ progress)
        "quiet": True,
        "no_warnings": True,

        # ---- Giới hạn ----
        "noplaylist": True,           # Không tải cả playlist
        "playlistend": 1,             # Nếu là link playlist, chỉ lấy video đầu

        # ---- Post-processing ----
        "postprocessors": postprocessors,
        # Giữ file gốc riêng lẻ để debug nếu cần (mặc định xoá sau merge)
        "keepvideo": False,
    }

    # ── Thực thi ───────────────────────────────────────────────────────────────
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Lấy thông tin video trước
            print(f"\n  Đang lấy thông tin video ...")
            info = ydl.extract_info(url, download=False)

            title = info.get("title", "Unknown")
            duration = info.get("duration", 0)
            height = info.get("height", 0)

            mins, secs = divmod(duration, 60) if duration else (0, 0)
            print(f"  Tiêu đề : {title[:120]}")
            print(f"  Thời lượng : {mins}m{secs:02d}s")

            if not audio_only:
                # Tìm độ phân giải cao nhất thực sự có sẵn
                formats = info.get("formats", [])
                max_h = max((f.get("height") or 0 for f in formats), default=0)
                print(f"  Độ phân giải tối đa: {max_h}p")
                if height:
                    print(f"  Độ phân giải sẽ tải: {min(height, 2160)}p")
                print()

            print(f"  Bắt đầu tải ...\n")
            ydl.download([url])
            print(f"\n  ✓ Tải thành công! File được lưu tại: {output_dir}/\n")

    except yt_dlp.utils.DownloadError as e:
        msg = str(e).lower()
        if "age" in msg and ("restrict" in msg or "confirm" in msg):
            print(
                "\n  ✗ Video bị giới hạn độ tuổi.\n"
                "  → android_vr client không hỗ trợ cookie để xác thực tuổi.\n"
                "  → Thử dùng client khác: sửa player_client thành ['web'] và\n"
                "    thêm dòng 'cookiefile': 'cookies.txt' vào ydl_opts.\n"
                "  → Hoặc tải cookies từ Chrome: yt-dlp --cookies-from-browser chrome\n"
            )
        elif "no video formats" in msg or "requested format" in msg:
            print(
                "\n  ✗ Không tìm thấy định dạng 4K cho video này.\n"
                "  → Video có thể chỉ có sẵn ở độ phân giải thấp hơn.\n"
                "  → Hệ thống sẽ tự động chọn định dạng tốt nhất có sẵn.\n"
            )
        elif "ffmpeg" in msg or "ffprobe" in msg:
            print(
                "\n  ✗ Không tìm thấy ffmpeg.\n"
                "  → Cài đặt: brew install ffmpeg  (macOS)\n"
                "            apt install ffmpeg   (Linux)\n"
                "            winget install ffmpeg (Windows)\n"
            )
        elif "sign in" in msg or "bot" in msg:
            print(
                "\n  ✗ YouTube yêu cầu xác thực.\n"
                "  → Thử thêm cookies: dùng --cookies-from-browser chrome\n"
                "    hoặc thêm 'cookiefile': 'cookies.txt' vào ydl_opts.\n"
            )
        else:
            print(f"\n  ✗ Lỗi tải xuống: {e}\n")

    except Exception as e:
        print(f"\n  ✗ Lỗi không xác định: {e}\n")


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="YouTube 4K Downloader — tải video chất lượng cao nhất (tối đa 4K)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ví dụ:
  python3 yt_downloader.py "https://www.youtube.com/watch?v=LXb3EKWsInQ"
  python3 yt_downloader.py "https://www.youtube.com/watch?v=LXb3EKWsInQ" -o ./videos
  python3 yt_downloader.py "https://youtu.be/dQw4w9WgXcQ" --audio
  python3 yt_downloader.py "https://www.youtube.com/watch?v=..." -o ~/Downloads
        """,
    )
    parser.add_argument("url", help="Link YouTube cần tải")
    parser.add_argument(
        "-o", "--output", default=".",
        help="Thư mục lưu file đầu ra (mặc định: thư mục hiện tại)",
    )
    parser.add_argument(
        "--audio", action="store_true",
        help="Chỉ trích xuất âm thanh MP3 320kbps, không tải video",
    )

    args = parser.parse_args()

    # Tạo thư mục output nếu chưa tồn tại
    os.makedirs(args.output, exist_ok=True)

    download_video(args.url, output_dir=args.output, audio_only=args.audio)


if __name__ == "__main__":
    main()
