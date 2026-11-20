# Đảo Đèn Lồng — Đèn Cạn Dầu (Day 12 AI SDLC Lab)

> Game 3D góc nhìn thứ ba (Three.js + TypeScript) gồm **3 Đêm (Đảo Bến · Đảo Cau · Đảo Chuông)** với cơ chế **nhiên liệu đèn, Bóng Mực hút dầu, sống sót tới bình minh, sức chứa tăng dần & chế độ mù màu**, kèm lõi mô phỏng tất định 60Hz tuân thủ **Test Contract v1.2**.
> - **MSSV – Họ tên:** `2A202603546` – Bùi Thế Anh
> - **Trạng thái hiện tại:** Hoàn thành **Phase 3 (`TICKET-03 — "Đèn cạn dầu"` · `Contract v1.2`)** — Tag `phase-3`
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

## 2. Điều khiển & Cài đặt

| Phím / Thao tác | Chức năng |
|---|---|
| `W` `A` `S` `D` | Di chuyển Mây theo hướng camera (`6.0 m/s`, `7.2 m/s` khi có Bùa Gió) |
| `Space` | Nhảy (`7.0 m/s`, trọng lực `-20 m/s²`, điều khiển trên không đầy đủ) |
| `Shift` | Lướt / Dash (`14 m/s`, `0.2 s`, hồi chiêu `1.5 s`; không hồi chiêu khi có Bùa Gió; giữ độ cao trên không) |
| `E` / `F` | Thắp đèn mới (`10` đom đóm), thắp lại đèn đã từng sáng (`5` đom đóm), hoặc **châm dầu** đèn đang sáng (`+10` dầu/đom đóm) |
| `Q` | Tỏa Sáng xua Bóng Mực & Gió Lạc (tốn `3` đom đóm, bán kính 3D `5 m`, choáng `2 s`, đẩy `4 m`, hồi `3 s`) |
| `Esc` / `P` | Tạm dừng / Tiếp tục (mở menu Pause & Cài đặt) |
| Kéo chuột trái hoặc `←` / `→` / `J` / `L` | Xoay camera 3D (chỉnh độ nhạy chuột trong Cài đặt) |
| `M` | Bật / tắt âm thanh |

- **Chế độ mù màu ("Bảng màu dễ phân biệt"):** Bật trong Cài đặt (lưu bền trong `localStorage`) — đổi viền & mắt Bóng Mực `#7A3CFF → #00B3FF`, cảnh báo UI `#FF5A5F → #FFFFFF` kèm biểu tượng `⚠`. Đèn tắt luôn xẹp 20% kèm vết rách giấy; đèn đang sáng có thanh dầu 3D và nhấp nháy `1 Hz` khi `fuel < 30`.

---

## 3. Luật chơi & Cách tính điểm (Contract v1.2 — Phase 3)

- **Mục tiêu sống sót tới bình minh (không thắng sớm):**
  - **Đêm 1 — Đảo Bến (`240 s`):** Giữ sáng ít nhất **`3 / 5`** đèn khi hết giờ.
  - **Đêm 2 — Đảo Cau (`270 s`):** Giữ sáng ít nhất **`4 / 6`** đèn khi hết giờ.
  - **Đêm 3 — Đảo Chuông (`300 s`):** Giữ sáng ít nhất **`5 / 7`** đèn khi hết giờ.
  - Hết Ngọn Lửa luôn thua ngay (`no_flames`), kể cả ở tick bình minh.
- **Nhiên liệu đèn & Bóng Mực hút dầu:**
  - Đèn vừa thắp có `fuel = 100`, tự hao `1.0/s` (tính bằng đơn vị nguyên `1/60`). Hết dầu (`≤ 0`) đèn tắt (`deposited = 0`, nhớ `ever_lit = true`, thắp lại chỉ tốn `5` đom đóm).
  - Đèn có `fuel < 30` **mất vùng an toàn** (đúng `30` vẫn giữ). Bóng Mực ở trạng thái `wander` tự tìm tới đèn yếu (`fuel < 30`), vào `≤ 2 m` sẽ chuyển sang `drain` và hút `5 fuel/s` (cộng dồn nhiều con). Châm dầu vượt `≥ 30` đẩy Bóng Mực ra mép vùng `6 m` trong `≤ 30` tick mà không gây sát thương.
- **Sức chứa tăng dần:** `10 + 2 × successful_lights` (tối đa `20`), tính cả thắp mới và thắp lại, đặt lại đầu mỗi Đêm.
- **Công thức điểm chuẩn (`game.contract.json` v1.2):**
  - Mỗi đom đóm nạp vào đèn (thắp mới, thắp lại, châm dầu): **`+5`**
  - Thắp đèn lần đầu: **`+100`** · Thắp lại (`ever_lit`): **`+40`**
  - Bóng Mực trúng Tỏa Sáng: tổng **`+5`** mỗi con · tổng **`+15`** nếu ngay trước đó đang `drain`
  - Thưởng bình minh (chỉ khi thắng `dawn_survived`): **`+50 + floor(fuel)`** mỗi đèn đang sáng + **`+50`** mỗi Ngọn Lửa còn lại *(bỏ thưởng thời gian)*.

---

## 4. Chạy kiểm thử & Chế độ Headless (Test Contract v1.2)

### Chạy toàn bộ cổng kiểm chứng (build + 34 Vitest tests + hồi quy P1–P2 + 6 scenario P3 + benchmark Đêm 3 + tất định)
```bash
npm run verify
```

### Chạy trực tiếp Headless cho Đêm 1, 2 hoặc 3
```bash
node dist-headless/cli.js \
  --seed 9001 \
  --night 3 \
  --ticks 18000 \
  --snapshot-every 600 \
  --out night3.jsonl
```

- Thông số nguồn chân lý duy nhất: [game.contract.json](game.contract.json) (`contract_version: "1.2"`).
- File `--inputs` hoặc `--scenario` sai định dạng thoát mã **`2`** và ghi lỗi ra `stderr`.

---

## 5. Tài liệu SDLC, ADR, Changelog, Bằng chứng & Harness AI

- **Quyết định kiến trúc (ADR):** [docs/adr/ADR-001-lantern-fuel-and-dawn-survival.md](docs/adr/ADR-001-lantern-fuel-and-dawn-survival.md)
- **Thay đổi phá vỡ tương thích (Breaking Changes):** [CHANGELOG.md](CHANGELOG.md)
- **Đặc tả các phase:** [phase-1-spec.md](docs/notes/phase-1-spec.md) · [phase-2-spec.md](docs/notes/phase-2-spec.md) · [phase-3-spec.md](docs/notes/phase-3-spec.md)
- **Bằng chứng thật & ma trận truy vết:** [Phase 1 REPORT](docs/proof/phase-1/REPORT.md) · [Phase 2 REPORT](docs/proof/phase-2/REPORT.md) · [Phase 3 REPORT](docs/proof/phase-3/REPORT.md)
- **Nhật ký dùng AI, phân tích lỗi AI & ước tính token:** [docs/notes/ai-log.md](docs/notes/ai-log.md)
- **Harness AI:** [AGENTS.md](AGENTS.md) · [.agents/skills/verify-phase/SKILL.md](.agents/skills/verify-phase/SKILL.md) · [.claude/settings.json](.claude/settings.json) (`scripts/gate-check.mjs`) · [.github/workflows/ci.yml](.github/workflows/ci.yml)
- **Bản quyền & nguồn tài nguyên:** [LICENSE](LICENSE) · [CREDITS.md](CREDITS.md)
