# Retrospective — Day 12 AI SDLC: Đảo Đèn Lồng (Phase 1 → Phase 4 / `v1.0.0`)

> **Tác giả:** Bùi Thế Anh (`2A202603546`) · **Release:** `v1.0.0` (tags `phase-1` → `phase-4`)

---

## 1. Tổng hợp Evaluation qua 4 Phase

| Phase | Phạm vi & Contract | Kết quả kiểm chứng | Điểm nổi bật & bài học cốt lõi |
|---|---|---|---|
| **Phase 1 (`phase-1`)** | `PRD-0` · Contract `v1.0` — Đêm 1 Đảo Bến + headless CLI + harness CP0 | `19/19` Vitest, 6 scenarios, SHA-256 3000-tick tất định | Tách sạch `src/core/` khỏi Three.js/DOM ngay từ đầu giúp 100% logic chạy headless cực nhanh. Kiểm toán độc lập bắt sớm lỗi trôi IEEE-754 trên timer. |
| **Phase 2 (`phase-2`)** | `Ticket-02` · Contract `v1.1` — Chuẩn hóa số liệu, 3 Đêm (Đảo Bến/Cau/Chuông), Lướt, Gió Lạc, Bùa Gió, Tạm dừng | `23/23` Vitest, 10 scenarios, Đêm 3 `21.600` tick chạy `0.95 s` (`<= 30 s`), SHA-256 tất định | Xây bản đồ hình học chuẩn bằng hàm toán học tường minh (`src/core/maps.ts`) và kiểm tra tọa độ góc cực đối chiếu thẳng với tọa độ trong ticket trước khi code tránh toàn bộ lỗi lệch trục. |
| **Phase 3 (`phase-3`)** | `Ticket-03` · Contract `v1.2` — Thay luật gốc: dầu đèn (`1/60` nguyên), Bóng Mực `drain`, thắng kiểu sống sót tới bình minh, sức chứa động, chế độ mù màu | `34/34` Vitest, 16 scenarios + ADR-001 + CHANGELOG, Đêm 3 `18.000` tick chạy `2.35 s` | Lưu dầu dạng số nguyên `1/60` (`6000 = 100.0`) loại bỏ hoàn toàn sai số cộng dồn sau hàng nghìn tick; viết ADR-001 và cập nhật test cũ có ghi rõ lý do giúp lịch sử thay đổi minh bạch. |
| **Phase 4 (`phase-4` / `v1.0.0`)** | `Ticket-04` · Contract `v1.3` — Benchmark 3D 1280×720 (`InstancedMesh`), Soak 10 Đêm, Bảng xếp hạng cục bộ (`--export-leaderboard`), Dễ tiếp cận, Đóng gói & Release | `42/42` Vitest, 17 scenarios, Soak 10 Đêm `0` crash (`41 → 44.9 MB` trong `4 s`), Benchmark 3D thật (`bench.json`: `44.9 FPS` trên Intel UHD 620, +47% sau tối ưu) | Tối ưu `THREE.InstancedMesh` + `MeshLambertMaterial` + gộp 72 mây thành 1 draw call tăng mạnh FPS thực tế; khởi động JIT trước Đêm 1 giữ RSS ổn định `1.095×`. |

---

## 2. Điều gì hiệu quả & chưa hiệu quả khi làm việc với AI

### Hiệu quả rõ rệt
1. **Spec & kế hoạch kiểm chứng TRƯỚC khi viết code (`docs/notes/phase-N-spec.md`):** Viết rõ tiêu chí nghiệm thu và giả định trước mỗi phase giúp AI đi thẳng vào kiến trúc đúng, hầu như không phải đập đi xây lại.
2. **Một nguồn chân lý duy nhất (`game.contract.json`):** Import trực tiếp `game.contract.json` vào `src/core/config.ts` làm cho sai lệch thông số giữa game và Test Contract trở thành *bất khả thi về mặt biên dịch*.
3. **Tách biệt người viết và người kiểm toán:** Sử dụng subagent đọc-chỉ độc lập (`Independent Contract Reviewer`, `Phase 2 Contract Auditor`, `Phase 3 Auditor`, `Phase 4 Release Auditor`) phát hiện được những lỗi tinh vi mà chính agent viết code bỏ sót.
4. **Cổng kiểm chứng một lệnh (`npm run verify`) + Stop hook (`scripts/gate-check.mjs`):** Ép mọi thay đổi phải qua `tsc` + `vite build` + `esbuild` + `vitest` + scenarios + soak + determinism trước khi gắn tag.

### Chưa hiệu quả / Hạn chế gặp phải
1. **AI dễ mắc lỗi off-by-1 giữa các bước trong tick** khi vừa có bước giảm bộ đếm (Step 2) vừa có bước kích hoạt hành động (Step 3/7/8/9) — ví dụ Lướt trên không giữ độ cao thiếu tick thứ 12, `recoil` chạy 59 thay vì 60 tick, Bùa Gió 599 thay vì 600 tick.
2. **Sai số dấu phẩy động IEEE-754** khi AI ban đầu viết `timer -= 1/60` và `initial - simTick * (1/60)` gây trễ +1 tick trên nhiều mốc thời gian.
3. **Hạn chế đo đạc WebGL trong sandbox:** Trong Phase 1–3 không có GPU/trình duyệt trực tiếp trong sandbox nên chưa đo FPS thực tế sớm; tới Phase 4 khi xây `dist-headless/bench.js` chạy Chrome 1280×720 thật mới có số đo GPU đầy đủ.

---

## 3. Các lỗi AI đã mắc, cách phát hiện & cách cải tiến Harness

- **Lỗi số học dấu phẩy động (`timer -= 1/60` & `simTick * DT`):** Phát hiện bởi subagent kiểm toán độc lập Phase 1 → chuyển toàn bộ timer sang tick số nguyên và lưu dầu ở đơn vị nguyên `1/60` → **cập nhật `AGENTS.md` Rule #3**, từ Phase 2 đến Phase 4 không lặp lại nữa.
- **Lỗi đồng bộ va chạm 3D & vùng an toàn:** `pulse` đẩy Bóng Mực vào vùng an toàn (Phase 1), Gió Lạc giữ `y = 1.2` không trúng Tỏa Sáng 3D trên Tầng 2 Đêm 3 (Phase 2), đẩy vùng an toàn dùng `allowVoid = true` làm rơi Bóng Mực khỏi đảo (Phase 2) → phát hiện bởi kiểm toán độc lập → bổ sung regression tests cố định trong `tests/simulation.test.ts` & `tests/phase3.test.ts`.
- **Lỗi off-by-1 Lướt trên không (tick 12/12):** Phát hiện ngay khi chạy `npm test` thật (test không viết kiểu luôn đúng!) → sửa ngay trước khi kiểm toán xong.
- **Nút thắt draw calls 3D (~1.400 draw calls với 200 Bóng Mực + 100 đom đóm):** Phát hiện khi thiết kế cảnh benchmark Phase 4 → nâng cấp lên `THREE.InstancedMesh` (< 40 draw calls) và bổ sung quy tắc GPU instancing vào `AGENTS.md` Rule #4.

---

## 4. Harness nào giúp ích nhiều nhất?

1. **Subagent kiểm toán độc lập (`research` auditor):** Giá trị cao nhất — tìm ra phần lớn lỗi biên nghiêm trọng (C1–C4 ở Phase 1, 8 lỗi ở Phase 2, edge cases ở Phase 3–4) với chi phí token thấp vì chỉ đọc code.
2. **`AGENTS.md` ngắn gọn (~35–40 dòng) cập nhật dần qua các phase:** Giữ cố định các bất biến kỹ thuật (integer tick math, `1/60` fuel units, 12-step tick order, GPU instancing) mà không phình ngữ cảnh.
3. **Skill `.agents/skills/verify-phase/SKILL.md` + `scripts/verify-phaseN.mjs` + Stop hook `scripts/gate-check.mjs`:** Tự động hóa toàn bộ bước kiểm chứng & sinh bằng chứng thật, loại bỏ rủi ro quên chạy hồi quy.
4. **GitHub Actions CI (`.github/workflows/ci.yml`):** Bảo đảm bản nộp build & test xanh trên môi trường Linux sạch (Ubuntu) giống máy chấm.

---

## 5. Tổng hợp Token / Chi phí AI & Cách tiết kiệm

| Phase | Công việc chính | Ước tính Token (In / Out) | Chi phí quy đổi ước tính |
|---|---|---:|---:|
| Phase 1 | Đọc tài liệu lab + PRD-0, CP0 harness, lõi sim + CLI v1.0, 3D Đêm 1, tests, audit & proof | ~95k / ~28k | ~$0.65 |
| Phase 2 | Ticket-02, bản đồ 3 Đêm, sim 12 bước v1.1, 3D/HUD/Audio/Settings, 7 scenarios + 21.6k bench, audit | ~140k / ~42k | ~$0.95 |
| Phase 3 | Ticket-03, ADR-001, hệ thống dầu nguyên `1/60` + `drain` + bình minh, mù màu, 6 scenarios, audit | ~125k / ~36k | ~$0.85 |
| Phase 4 | Ticket-04, `InstancedMesh` + `bench.js` + `soak.js` + bảng xếp hạng đĩa + Accessibility + Retro + audit | ~135k / ~38k | ~$0.90 |
| **Tổng** | **Toàn dự án (4 phases, `v1.0.0`)** | **~495k in / ~144k out** | **~$3.35** |

**Các chiến lược tiết kiệm token đã áp dụng:**
- Giữ `AGENTS.md` gọn (< 45 dòng), không nhét lịch sử hay log dài vào ngữ cảnh thường trực.
- Luôn viết spec & tiêu chí kiểm chứng ngắn trước khi code để giảm số vòng sửa lại.
- Gom các thao tác đọc/ghi độc lập chạy song song và chỉ gửi phạm vi file liên quan cho subagent kiểm toán.
- Chạy script kiểm chứng cục bộ bằng Node (`npm run verify`) thay vì nhờ AI đọc hàng nghìn dòng JSONL thủ công.

---

## 6. Nếu làm lại dự án này, sẽ đổi gì?

1. **Dùng `THREE.InstancedMesh` ngay từ Phase 1** cho đom đóm và Bóng Mực thay vì refactor ở Phase 4.
2. **Đặt toàn bộ trạng thái thời gian (timer, fuel, cooldown) bằng số nguyên tick ngay từ ngày đầu** thay vì sửa lại sau kiểm toán Phase 1.
3. **Tách sẵn lớp launcher Node (`scripts/run-game.mjs`) từ Phase 1** để việc bổ sung API cục bộ (`--export-leaderboard`) và đóng gói tĩnh trở nên liền mạch ngay từ đầu.
4. **Quay clip ngắn và đo FPS 1280×720 ngay cuối mỗi phase** thay vì dồn toàn bộ kiểm tra đồ họa sang Phase 4.
