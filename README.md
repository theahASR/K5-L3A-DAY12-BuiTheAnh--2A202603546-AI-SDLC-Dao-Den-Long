# Đảo Đèn Lồng — Đêm 1: Đảo Bến (Day 12 AI SDLC Lab)

> Game 3D góc nhìn thứ ba (Three.js + TypeScript) kèm lõi mô phỏng tất định 60Hz và chế độ **headless tuân thủ Test Contract v1.0**.
> - **MSSV – Họ tên:** `2A202603546` – Bùi Thế Anh
> - **Trạng thái hiện tại:** Hoàn thành **Phase 1 (`PRD-0` + `Test Contract v1.0`)** — Tag `phase-1`
> - **Video demo:** *(sẽ bổ sung tại Phase 4 / Release `v1.0.0`)*

---

## 1. Cài đặt & Chạy game (3 lệnh)

Yêu cầu: **Node.js >= 18** (chạy được trên macOS, Linux và Windows).

```bash
npm ci
npm run build
npm run preview
```

Mở trình duyệt tới địa chỉ Vite hiển thị (mặc định `http://localhost:4173`) để chơi **Đêm 1 – Đảo Bến**.
*(Trong quá trình phát triển có thể chạy trực tiếp `npm run dev`.)*

---

## 2. Điều khiển

| Phím / Thao tác | Chức năng |
|---|---|
| `W` `A` `S` `D` | Di chuyển Mây theo hướng camera |
| `Space` | Nhảy |
| `E` / `F` | Nạp ánh sáng đom đóm vào Đèn Lồng Lớn gần nhất (trong `2.5 m`) |
| `Q` / `Shift` | Tỏa sáng xua & làm choáng Bóng Mực (tốn `1` đom đóm, hồi `2.0 s`) |
| Kéo chuột trái hoặc `←` / `→` / `J` / `L` | Xoay góc nhìn camera 3D |
| `M` | Bật / tắt âm thanh |

---

## 3. Luật chơi & Cách tính điểm (khớp `game.contract.json`)

- **Mục tiêu:** Thu thập đom đóm (tối đa `5` đom đóm mang theo) và nạp đủ `5` đom đóm cho mỗi Đèn Lồng Lớn để thắp sáng cả **5 Đèn Lồng Lớn** (`L1`–`L5`) trong `300 giây`.
- **Nguy hiểm:** Bóng Mực đuổi theo Mây (`3.8 m/s`). Bị chạm (`<= 1.2 m`) mất `1` ngọn lửa (tối đa `3`), đánh rơi `floor(carried * 0.5)` đom đóm, và nhận `1.5 s` miễn nhiễm sát thương.
- **Bảo vệ:**
  - Đèn Lồng Lớn **đã thắp sáng** tạo vùng an toàn bán kính `6.0 m` mà Bóng Mực không thể tiến vào.
  - **Tỏa sáng (`Q`/`Shift`)** tốn `1` đom đóm, làm choáng (`3.0 s`) và đẩy lùi (`4.0 m`) toàn bộ Bóng Mực trong bán kính `6.0 m` (hồi chiêu `2.0 s`).
- **Rơi khỏi đảo (`fall_enabled: false`):** Mép đảo Đảo Bến có rào chắn sương mềm ở bán kính `38 m`, Mây không rơi khỏi đảo nên không phát sinh sự kiện `player_hit` với `by: "fall"`.
- **Công thức tính điểm:**
  - Nhặt 1 đom đóm: **`+10`** (`per_mote`)
  - Thắp sáng 1 Đèn Lồng Lớn: **`+100`** (`per_lantern`)
  - Làm choáng 1 Bóng Mực bằng Tỏa sáng: **`+25`** (`per_stun`)
  - Thưởng khi **thắng** (`all_lit`): **`+floor(time_left_s) × 2`** (`per_second_left`) + **`+flames × 50`** (`per_flame_left`)

---

## 4. Chạy kiểm thử & Chế độ Headless (Test Contract v1.0)

### Chạy toàn bộ bộ kiểm chứng (build + unit test + CLI contract test + 6 scenario + tất định)
```bash
npm run verify
```

### Chạy chỉ unit & CLI tests
```bash
npm test
```

### Chạy trực tiếp chế độ Headless (sau `npm run build`)
```bash
node dist-headless/cli.js \
  --seed 100 \
  --night 1 \
  --scenario scenarios/phase1/win-flow.scenario.json \
  --inputs scenarios/phase1/win-flow.inputs.json \
  --ticks 600 \
  --snapshot-every 10 \
  --out out.jsonl
```

- Thông số tuning nguồn chân lý duy nhất: [game.contract.json](game.contract.json) (được import trực tiếp bởi `src/core/config.ts`).
- File inputs/scenario sai định dạng hoặc `tick` không tăng nghiêm ngặt sẽ ghi lỗi ra `stderr` và thoát với mã **`2`**.

---

## 5. Tài liệu SDLC, Bằng chứng & Harness AI

- **Đặc tả, giả định & kế hoạch kiểm chứng Phase 1:** [docs/notes/phase-1-spec.md](docs/notes/phase-1-spec.md)
- **Báo cáo kiểm chứng, ma trận truy vết & bằng chứng thật Phase 1:** [docs/proof/phase-1/REPORT.md](docs/proof/phase-1/REPORT.md)
- **Nhật ký dùng AI, phân tích lỗi AI & ước tính token:** [docs/notes/ai-log.md](docs/notes/ai-log.md)
- **Harness AI:**
  - Hướng dẫn tác nhân: [AGENTS.md](AGENTS.md)
  - Skill kiểm chứng phase: [.agents/skills/verify-phase/SKILL.md](.agents/skills/verify-phase/SKILL.md)
  - Stop hook chặn kết thúc khi test đỏ: [.claude/settings.json](.claude/settings.json) → `scripts/gate-check.mjs`
  - CI tự động: [.github/workflows/ci.yml](.github/workflows/ci.yml)
- **Bản quyền & nguồn tài nguyên:** [LICENSE](LICENSE) · [CREDITS.md](CREDITS.md)
- **Tài liệu đề bài gốc:** [GUIDE.md](GUIDE.md) · [CHECKPOINTS.md](CHECKPOINTS.md) · [SUBMISSION.md](SUBMISSION.md) · [RULES.md](RULES.md) · [RUBRIC.md](RUBRIC.md)
