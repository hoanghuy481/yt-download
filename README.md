# 🎬 VidGet — YouTube Downloader (Node.js)

Web app tải video YouTube chất lượng cao, viết bằng **Node.js + Express**.

## ✨ Tính năng
- Tải video tới **4K / 8K** (tự động ghép video + audio)
- Tải **MP3 320kbps**
- Xem thông tin video: thumbnail, tiêu đề, kênh, lượt xem
- Chọn nhiều chất lượng: 1080p, 720p, 480p,...
- Stream file trực tiếp, không cần lưu trên server lâu dài

---

## 🚀 Cài đặt & Chạy

### Yêu cầu
- **Node.js 18+**
- **yt-dlp** (Python tool)
- **FFmpeg** (để ghép video+audio 1080p+)

---

### Bước 1 — Cài FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt install ffmpeg
```

**Windows:**
```bash
winget install Gyan.FFmpeg
```

---

### Bước 2 — Cài yt-dlp

```bash
pip install yt-dlp
# hoặc
brew install yt-dlp
```

---

### Bước 3 — Cài Node dependencies

```bash
cd yt-downloader-node
npm install
```

---

### Bước 4 — Chạy server

```bash
npm start
```

Hoặc dùng **nodemon** để tự reload khi sửa code:

```bash
npm run dev
```

Mở trình duyệt: **http://localhost:3000**

---

## 📁 Cấu trúc

```
yt-downloader-node/
├── server.js        # Express backend
├── package.json
├── public/
│   └── index.html   # Giao diện web
└── downloads/       # Thư mục tạm (tự xóa sau khi gửi)
```

---

## ⚠️ Lưu ý
- Cần FFmpeg để ghép video 1080p+ (video và audio YouTube lưu riêng)
- Chỉ dùng cho mục đích cá nhân, tôn trọng bản quyền
- Cập nhật yt-dlp thường xuyên: `pip install -U yt-dlp`
