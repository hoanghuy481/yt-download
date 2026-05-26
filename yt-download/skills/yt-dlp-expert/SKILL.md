# SKILL: yt-dlp Expert

## Muc tieu
Tro thanh chuyen gia tai video/audio bang `yt-dlp` cho he thong tai YouTube tren production.

## Khi nao dung skill nay
- Loi tai video, loi format, loi timeout, loi geo-block.
- Can toi uu toc do tai, chat luong, va do on dinh sau khi deploy.
- Can fallback an toan khi metadata hoac stream URL bi thay doi.

## Dau vao toi thieu
- URL video hoac playlist.
- Dinh dang dau ra (`mp4` hoac `mp3`).
- Gioi han chat luong (vi du: `bestvideo+bestaudio/best`).

## Quy trinh chuan
1. Kiem tra URL hop le (`http/https`, host nam trong danh sach cho phep).
2. Kiem tra `yt-dlp` va `ffmpeg` co san trong moi truong.
3. Lay metadata truoc (`yt-dlp --dump-json`) de xac nhan video truy cap duoc.
4. Tai voi tham so on dinh:
   - `--no-playlist`
   - `--socket-timeout 30`
   - `--retries 10`
   - `--fragment-retries 10`
   - `--concurrent-fragments 1` (uu tien on dinh hon toc do)
5. Neu tai mp3: extract audio sau khi tai (`--extract-audio --audio-format mp3`).
6. Dat ten file an toan, loai bo ky tu nguy hiem, gioi han do dai.
7. Luon ghi log stderr chi tiet de debug production.

## Nguyen tac fallback
- Uu tien `yt-dlp` truc tiep, KHONG phu thuoc Piped/Invidious trong luong chinh.
- Neu can fallback, fallback theo nhom nguon du lieu metadata, khong doi toan bo pipeline.
- Neu nhieu lan that bai, tra ma loi ro rang va thong diep hanh dong tiep theo.

## Bao mat va van hanh
- Khong tai URL noi bo (`localhost`, `127.0.0.1`, IP private) de tranh SSRF.
- Gioi han kich thuoc file, thoi gian tai, va so job dong thoi.
- Don dep file tam va file cu trong thu muc downloads theo TTL.

## Checklist debug nhanh
- `yt-dlp --version`
- `ffmpeg -version`
- Thu command thu cong voi 1 URL cu the
- Kiem tra quota/CPU/RAM sau deploy
- Kiem tra loi mang DNS/TLS/egress cua platform
