# Đảo Đèn Lồng — v1.0.0 (Day 12 AI SDLC Lab)

> **Video demo (< 5 phút):** *(Đính kèm tại GitHub Release [`v1.0.0`](https://github.com/theahASR/K5-L3A-DAY12-BuiTheAnh--2A202603546-AI-SDLC-Dao-Den-Long/releases/tag/v1.0.0) sau khi quay & upload `demo.mp4`)*
> **MSSV – Họ tên:** `2A202603546` – Bùi Thế Anh · **Tags:** `phase-1`, `phase-2`, `phase-3`, `phase-4`, Release `v1.0.0` · **Test Contract:** `v1.3`

**Đảo Đèn Lồng** là game 3D góc nhìn thứ ba (Three.js + TypeScript) gồm **3 Đêm (Đảo Bến · Đảo Cau · Đảo Chuông)**. Người chơi điều khiển Mây thu thập đom đóm, thắp sáng & châm dầu cho các Đèn Lồng Lớn, né và xua đuổi Bóng Mực cùng Gió Lạc để giữ đủ ánh sáng tới tận bình minh. Lõi mô phỏng 60 Hz thuần TypeScript tách rời hoàn toàn khỏi lớp hiển thị 3D để chạy headless tất định, soak test 10 Đêm và benchmark WebGL 1280×720.

---

## 1. Yêu cầu hệ thống
- **Node.js `>= 18`** (khuyến nghị Node 20/22) và **npm** — chạy trên **macOS, Linux và Windows**.
- Trình duyệt hỗ trợ **WebGL2** (Chrome / Chromium / Edge / Firefox / Safari).
  - Chế độ `bench_cmd` tự động tìm Chrome / Chromium / Edge cục bộ (có thể ghi đè đường dẫn qua biến môi trường `BENCH_BROWSER`).
- *(Tùy chọn)* **Docker** để chạy bản đóng gói container (`Dockerfile`).

---

## 2. Cài đặt & Chạy game (3 lệnh)

```bash
npm ci
npm run build
npm start
```

Mở trình duyệt tới **`http://localhost:4173`** để chơi bản phát hành `v1.0.0` (kèm Bảng xếp hạng lưu đĩa cục bộ tại `~/.dao-den-long/leaderboard.json`).

### Hoặc chạy bằng Docker
```bash
docker build -t dao-den-long:1.0.0 .
docker run --rm -p 4173:4173 dao-den-long:1.0.0
```

---

## 3. Điều khiển & Dễ tiếp cận (Accessibility)

Tất cả **9 hành động** dưới đây đều có thể **đổi phím tự do** trong **Cài đặt** (tự động phát hiện trùng phím, có nút **Khôi phục mặc định**, tự lưu giữa các lần mở game):

| Hành động | Phím mặc định | Mô tả |
|---|---|---|
| Tiến / Lùi / Trái / Phải | `W` / `S` / `A` / `D` | Di chuyển theo hướng camera (`6.0 m/s`, `7.2 m/s` với Bùa Gió) |
| Nhảy | `Space` | Nhảy (`7.0 m/s`, trọng lực `-20 m/s²`, điều khiển trên không đầy đủ) |
| Lướt (Dash) | `Shift` | Lướt `14 m/s` trong `0.2 s` (hồi `1.5 s`, giữ độ cao trên không, không hồi khi có Bùa Gió) |
| Tương tác đèn | `E` | Nạp đom đóm thắp đèn (`10` lần đầu / `5` thắp lại) hoặc châm dầu (`+10` dầu/đom đóm) |
| Tỏa Sáng (Pulse) | `Q` | Tốn `3` đom đóm, bán kính 3D `5 m`, choáng `2 s`, đẩy `4 m` trong `15` tick, hồi `3 s` |
| Tạm dừng | `Esc` *(hoặc `P`)* | Đóng băng toàn bộ logic, mở Menu Tạm dừng / Cài đặt |
| Xoay camera | Kéo chuột trái hoặc `←`/`→`/`J`/`L` | Xoay góc nhìn 3D (chỉnh độ nhạy trong Cài đặt) |

**Tính năng Dễ tiếp cận:**
- **Phụ đề trực quan & chỉ báo hướng:** thông báo Bóng Mực xuất hiện kèm **mũi tên sống ở mép màn hình**, cảnh báo gió mạnh, đếm ngược `10 s` cuối, và cảnh báo đèn có `fuel < 30`.
- **Bảng màu dễ phân biệt (Colorblind mode):** đổi viền & mắt Bóng Mực sang `#00B3FF`, cảnh báo UI sang `#FFFFFF` kèm biểu tượng `⚠`; đèn tắt xẹp 20% + vết rách, đèn sáng có thanh dầu 3D nhấp nháy `1 Hz` khi `< 30`.
- **Giảm chuyển động (Reduce Motion):** tắt rung camera và hiệu ứng chớp/nhấp nháy.
- **Cỡ chữ UI:** tối thiểu **`18px`** ở `1280×720`, hỗ trợ bật **Chữ lớn (`×1.25`)**.

---

## 4. Luật chơi & Cách tính điểm (Contract `v1.3`)

- **3 Đêm sống sót tới bình minh:** Đêm 1 – Đảo Bến (`240 s`, cần `≥ 3/5` đèn), Đêm 2 – Đảo Cau (`270 s`, cần `≥ 4/6` đèn), Đêm 3 – Đảo Chuông (`300 s`, cần `≥ 5/7` đèn).
- **Dầu đèn & Bóng Mực `drain`:** Đèn sáng bắt đầu `100` dầu, tự hao `1.0/s`; dưới `30` dầu mất vùng an toàn `6 m` và bị Bóng Mực hút thêm `5/s` (cộng dồn nhiều con).
- **Sức chứa động:** `10 + 2 × số lần thắp thành công` (tối đa `20`), reset đầu mỗi Đêm.
- **Điểm số (`game.contract.json`):** `+5` mỗi đom đóm nạp/châm dầu · `+100` thắp lần đầu · `+40` thắp lại · `+5` Tỏa Sáng trúng Bóng Mực (`+15` nếu đang `drain`) · thưởng qua Đêm: `+(50 + floor(fuel))` mỗi đèn sáng + `+50` mỗi Ngọn Lửa còn lại.

---

## 5. Kiểm thử, Headless, Benchmark, Soak & Xuất Bảng xếp hạng

### Toàn bộ cổng kiểm chứng (`build` + `42` Vitest tests + hồi quy P1–P3 + `soak` 10 Đêm + export leaderboard)
```bash
npm run verify
```

### Chạy Headless CLI (Test Contract `v1.3`)
```bash
node dist-headless/cli.js --seed 42 --night 1 --ticks 600 --snapshot-every 10 --out out.jsonl
```

### Chạy 3D WebGL Benchmark (`1280×720`, 200 Bóng Mực + 100 đom đóm + L1–L3 `fuel 100`)
```bash
node dist-headless/bench.js --seed 42 --duration 30 --out bench.json
```
- Trình chạy tự động mở Chrome/Chromium ở cửa sổ `1280×720` (không toàn màn hình) với cờ `--disable-gpu-vsync --disable-frame-rate-limit` (`vsync_off: true`), khởi động `3 s`, đo đúng `30 s`, ghi `bench.json` và tự thoát mã `0`.
- Lưu ý về `peak_mem_mb`: trình duyệt Web chỉ cấp `performance.memory.usedJSHeapSize` (JS heap của trang web, không phải toàn bộ OS RSS của tiến trình trình duyệt).
- Kết quả đo tham khảo trên máy cá nhân (Windows 11, GPU tích hợp **Intel UHD Graphics 620**): xem [bench.json](bench.json) (`avg_fps: 44.9`, `load_ms: 8943`, sau tối ưu `THREE.InstancedMesh` + `MeshLambertMaterial` tăng +47.2% so với mức ban đầu `30.5 FPS`).

### Chạy Soak Test (10 Đêm liên tiếp trong 1 tiến trình)
```bash
node dist-headless/soak.js --seed 7 --nights 10 --out soak.json
```
- Kết quả thật ([soak.json](soak.json)): `10` Đêm, **`crashes: 0`**, `mem_start_mb: 41` → **`mem_end_mb: 44.9 MB`** (`1.095× <= 1.2×`), hoàn thành trong **`4 s`**.

### Xuất Bảng xếp hạng cục bộ
```bash
node scripts/run-game.mjs --export-leaderboard out.json
```

---

## 6. Tài liệu SDLC, Bằng chứng, Retro & Harness AI

- **Retrospective toàn dự án (4 phases):** [docs/notes/retro.md](docs/notes/retro.md)
- **Nhật ký dùng AI, 18 lỗi AI thực tế & token/chi phí:** [docs/notes/ai-log.md](docs/notes/ai-log.md)
- **Đặc tả & ADR:** [phase-1-spec.md](docs/notes/phase-1-spec.md) · [phase-2-spec.md](docs/notes/phase-2-spec.md) · [phase-3-spec.md](docs/notes/phase-3-spec.md) · [phase-4-spec.md](docs/notes/phase-4-spec.md) · [ADR-001](docs/adr/ADR-001-lantern-fuel-and-dawn-survival.md)
- **Bằng chứng thật từng phase:** [Phase 1](docs/proof/phase-1/REPORT.md) · [Phase 2](docs/proof/phase-2/REPORT.md) · [Phase 3](docs/proof/phase-3/REPORT.md) · [Phase 4](docs/proof/phase-4/REPORT.md) · [bench.json](bench.json) · [soak.json](soak.json)
- **Harness AI:** [AGENTS.md](AGENTS.md) · [.agents/skills/verify-phase/SKILL.md](.agents/skills/verify-phase/SKILL.md) · [.claude/settings.json](.claude/settings.json) (`scripts/gate-check.mjs`) · [.github/workflows/ci.yml](.github/workflows/ci.yml)
- **Phát hành & Bản quyền:** [CHANGELOG.md](CHANGELOG.md) · [CREDITS.md](CREDITS.md) · [LICENSE](LICENSE) · [game.contract.json](game.contract.json)
