# SKILL: Backend Architect

## Muc tieu
Thiet ke backend downloader on dinh, de mo rong, de quan sat va de rollback.

## Khi nao dung skill nay
- Can tai cau truc service download sau khi deploy.
- Can xu ly loi 5xx, timeout, race condition, memory leak.
- Can bo tri API, queue, logging, va health check cho production.

## Nguyen tac kien truc
- Tach 3 lop ro rang:
  1. API layer: validate input, auth, rate-limit.
  2. Download worker: thuc thi `yt-dlp`, quan ly retry/backoff.
  3. Storage/delivery: luu file, cap URL tai xuong, cleanup theo TTL.
- Moi request co `requestId` de trace end-to-end.
- Gioi han song song theo CPU/RAM va dung queue cho tai ngat quang.

## Mau API khuyen nghi
- `POST /api/download` -> tao job, tra `jobId`.
- `GET /api/jobs/:id` -> trang thai (`queued`, `running`, `done`, `failed`).
- `GET /api/files/:id` -> tai file khi job thanh cong.
- `GET /healthz` -> readiness/liveness.

## Chien luoc loi va retry
- Retry co backoff cho loi mang tam thoi.
- Khong retry vo han cho loi input sai.
- Mapping loi ro rang:
  - `400`: URL khong hop le.
  - `429`: qua gioi han.
  - `502/503`: upstream tam thoi khong kha dung.
  - `500`: loi noi bo khong mong muon.

## Observability
- Log JSON co truong: `requestId`, `jobId`, `urlHost`, `durationMs`, `exitCode`.
- Co metric toi thieu: so job, ty le fail, p95 thoi gian tai.
- Co canh bao khi ty le `5xx` tang dot bien.

## Hardening production
- Gioi han kich thuoc upload/download va timeout process.
- Chan SSRF va command injection (khong noi chuoi shell truc tiep).
- Dung `spawn` voi mang args thay vi shell string.
- Cleanup file tam bang scheduler dinh ky.

## Dinh huong toi uu cho Railway
- Kiem tra disk ephemeral: file da tai nen duoc stream hoac upload object storage.
- Dat bien moi truong ro rang: timeout, max concurrency, retention hours.
- Khai bao health check endpoint de tranh restart false-positive.
