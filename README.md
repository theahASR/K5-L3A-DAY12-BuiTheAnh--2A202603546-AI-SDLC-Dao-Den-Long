# Đảo Đèn Lồng — Ba Hòn Đảo (Day 12 AI SDLC Lab)

> Game 3D góc nhìn thứ ba (Three.js + TypeScript) gồm **3 Đêm (Đảo Bến · Đảo Cau · Đảo Chuông)** kèm lõi mô phỏng tất định 60Hz và chế độ **headless tuân thủ Test Contract v1.1**.
> - **MSSV – Họ tên:** `2A202603546` – Bùi Thế Anh
> - **Trạng thái hiện tại:** Hoàn thành **Phase 2 (`Ticket-02 — Ba hòn đảo` · `Contract v1.1`)** — Tag `phase-2`
> - **Video demo:** *(sẽ bổ sung tại Phase 4 / Release `v1.0.0`)*

---

## 1. Cài đặt & Chạy game (3 lệnh)

Yêu cầu: **Node.js >= 18** (chạy được trên macOS, Linux và Windows).

```bash
npm ci
npm run build
npm run preview
```

Mở trình duyệt tới địa chỉ Vite hiển thị (mặc định `http://localhost:4173`) để chơi chuỗi **3 Đêm — Đảo Bến, Đảo Cau, Đảo Chuông**.
*(Khi phát triển có thể chạy trực tiếp `npm run dev`.)*

---

## 2. Điều khiển

| Phím / Thao tác | Chức năng |
|---|---|
| `W` `A` `S` `D` | Di chuyển Mây theo hướng camera (`6.0 m/s`, `7.2 m/s` khi có Bùa Gió) |
| `Space` | Nhảy (`7.0 m/s`, trọng lực `-20 m/s²`, điều khiển trên không đầy đủ) |
| `Shift` | Lướt / Dash (`14 m/s`, `0.2 s`, hồi chiêu `1.5 s`; không hồi chiêu khi có Bùa Gió; giữ độ cao trên không) |
| `E` / `F` | Nạp đom đóm vào Đèn Lồng Lớn gần nhất (bán kính `2.0 m`) |
| `Q` | Tỏa Sáng xua Bóng Mực & Gió Lạc (tốn `3` đom đóm, bán kính 3D `5 m`, choáng `2 s`, đẩy `4 m`, hồi `3 s`) |
| `Esc` / `P` | Tạm dừng / Tiếp tục (đóng băng hoàn toàn logic, mở menu Pause & Cài đặt) |
| Kéo chuột trái hoặc `←` / `→` / `J` / `L` | Xoay camera 3D (chỉnh độ nhạy chuột trong Cài đặt) |
| `M` | Bật / tắt âm thanh |

---

## 3. Ba Hòn Đảo, Luật chơi & Cách tính điểm (Contract v1.1)

- **Đêm 1 — Đảo Bến (`300 s`, 5 đèn `L1`–`L5`):** Đảo tròn bán kính `40 m`, ngoài `40 m` là biển mây (rơi dưới `Y < -10` mất 1 Ngọn Lửa & toàn bộ đom đóm đang mang, hồi sinh sau `60` tick với `90` tick bất tử).
- **Đêm 2 — Đảo Cau (`330 s`, 6 đèn `L1`–`L6`):** Hai đảo tròn bán kính `28 m` nối bằng cầu tre không lan can + **2 bục nhảy** + **Bùa Gió `C1`** giữa cầu + kẻ địch mới **Gió Lạc (`D1`, `D2`)** rình cướp đom đóm khi Mây mang `>= 5`.
- **Đêm 3 — Đảo Chuông (`360 s`, 7 đèn `L1`–`L7`):** Đảo 3 tầng (`Y = 0 / 3 / 6`), **2 dốc thẳng** ở `30°` & `150°`, **bục nhảy** lên tầng 2, **Tháp Chuông** ở tâm, **2 Bùa Gió**, **Gió Lạc** và **Gió mạnh** mỗi `30 s` kéo dài `5 s` đẩy `2 m/s`.
- **Công thức tính điểm chuẩn (khớp `game.contract.json` v1.1):**
  - Nạp 1 đom đóm vào đèn: **`+10`** (`per_mote`)
  - Thắp sáng 1 Đèn Lồng Lớn (đủ `10` đom đóm): **`+100`** (`per_lantern`)
  - Làm trúng 1 Bóng Mực bằng Tỏa Sáng: **`+5`** (`per_stun`, kể cả con đang choáng)
  - Thưởng khi **thắng** (`all_lit`): **`+floor(time_left_s) × 2`** (`per_second_left`) + **`+flames × 50`** (`per_flame_left`)
  - **Tổng điểm chiến dịch:** Tổng điểm các Đêm đã thắng, hiển thị ở màn hình **Bình Minh** sau Đêm 3.

---

## 4. Chạy kiểm thử & Chế độ Headless (Test Contract v1.1)

### Chạy toàn bộ cổng kiểm chứng (build + 23 Vitest tests + hồi quy P1 + 7 scenario P2 + benchmark 21.600 tick + tất định)
```bash
npm run verify
```

### Chạy trực tiếp Headless cho Đêm 1, 2 hoặc 3
```bash
node dist-headless/cli.js \
  --seed 9001 \
  --night 3 \
  --ticks 21600 \
  --snapshot-every 600 \
  --out night3.jsonl
```

- Thông số nguồn chân lý duy nhất: [game.contract.json](game.contract.json) (`contract_version: "1.1"`).
- Hiệu năng đo thật Đêm 3 đầy đủ `21.600` tick: **`~0.95 s`** (ngưỡng yêu cầu `<= 30 s`), tất định khớp SHA-256 100%.
- File `--inputs` hoặc `--scenario` sai định dạng thoát mã **`2`** và ghi lỗi ra `stderr`.

---

## 5. Tài liệu SDLC, Bằng chứng & Harness AI

- **Đặc tả & thay đổi yêu cầu:** [docs/notes/phase-1-spec.md](docs/notes/phase-1-spec.md) · [docs/notes/phase-2-spec.md](docs/notes/phase-2-spec.md)
- **Bằng chứng thật & ma trận truy vết:** [docs/proof/phase-1/REPORT.md](docs/proof/phase-1/REPORT.md) · [docs/proof/phase-2/REPORT.md](docs/proof/phase-2/REPORT.md)
- **Nhật ký dùng AI, phân tích 11 lỗi AI & ước tính token:** [docs/notes/ai-log.md](docs/notes/ai-log.md)
- **Harness AI:** [AGENTS.md](AGENTS.md) · [.agents/skills/verify-phase/SKILL.md](.agents/skills/verify-phase/SKILL.md) · [.claude/settings.json](.claude/settings.json) (`scripts/gate-check.mjs`) · [.github/workflows/ci.yml](.github/workflows/ci.yml)
- **Bản quyền & nguồn tài nguyên:** [LICENSE](LICENSE) · [CREDITS.md](CREDITS.md)
- **Tài liệu lab gốc:** [GUIDE.md](GUIDE.md) · [CHECKPOINTS.md](CHECKPOINTS.md) · [SUBMISSION.md](SUBMISSION.md) · [RULES.md](RULES.md) · [RUBRIC.md](RUBRIC.md)
