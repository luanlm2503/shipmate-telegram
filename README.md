# shipmate-telegram

Telegram relay bot điều khiển [Herdr](https://herdr.dev) agents từ xa qua Telegram.

Nhắn tin từ điện thoại → bot chuyển tiếp cho agent `first-mate` → trả lời gọn về Telegram. Bot cũng tự động báo khi crewmate `blocked` (cần duyệt) hoặc `finished` (xong việc).

Mọi prompt forward tự kèm directive: mặc định workflow theo skill `shipmate` (Herdr worktree + crew agents, mở crew trust-all), cấm dùng interactive question dialog / approval UI, chỉ dùng default hợp lý và trả lời text thuần.

## Tính năng

- Forward mọi tin nhắn text tới `first-mate` (Herdr agent persistent, tự tạo lại nếu bị xóa).
- Lệnh `/status` — liệt kê agents + trạng thái + workspace.
- Lệnh `/stop <name>` — xóa worktree của crewmate (chặn xóa `first-mate`).
- Lệnh `/firstmate` — xem trạng thái + nội dung màn hình hiện tại của `first-mate` (read-only, không gửi prompt, không tạo pane).
- Duyệt nhanh khi `first-mate` bị `blocked`:
  - Menu chọn: nhắn **số option** (`1`, `2`, `3`... kể cả lẫn trong chữ như `ok 1`, `chọn 2`) → bot gửi `down`×(N-1) + `enter` để chọn đúng option.
  - Xác nhận thường: `ok` / `allow` / `yes` (= Enter), `reject` / `no` (= Esc).
  - Tin nhắn lạ khi đang blocked → bot hướng dẫn lại thay vì báo lỗi khó hiểu.
- Poll định kỳ `herdr agent list`, chỉ báo chuyển trạng thái thật (`working`/`blocked` → `blocked` / `idle` / `done`); không báo cho `first-mate`, không báo agent mới thấy lần đầu.
- Chống prompt chồng lấn (concurrency guard), chống kẹt prompt-stalled/timeout bằng `agent get` kiểm tra lại.
- Làm sạch output terminal (box-drawing, metadata, dòng trùng, chrome) trước khi gửi Telegram, cắt tối đa 4000 ký tự/tin.
- Chỉ phục vụ 1 `TELEGRAM_CHAT_ID` duy nhất, drop silently tin từ người lạ.

## Yêu cầu

- Node.js 22+
- Herdr CLI đã cài và có trên `PATH` (`herdr agent list` chạy được)
- 1 Telegram Bot Token (tạo qua [@BotFather](https://t.me/BotFather))
- Telegram Chat ID của bạn (lấy qua [@userinfobot](https://t.me/userinfobot))

## Cài đặt

```powershell
git clone https://github.com/luanlm2503/shipmate-telegram.git
Set-Location shipmate-telegram
npm install
Copy-Item .env.example .env
notepad .env
npm start
```

## Cấu hình `.env`

| Biến | Bắt buộc | Mặc định | Mô tả |
|------|----------|----------|-------|
| `TELEGRAM_BOT_TOKEN` | ✅ | — | Token của BotFather |
| `TELEGRAM_CHAT_ID` | ✅ | — | Chat ID được phép điều khiển bot |
| `NOTIFY_POLL_INTERVAL_MS` | — | `5000` | Chu kỳ poll `herdr agent list` để báo blocked/finished |
| `FIRST_MATE_AGENT_KIND` | — | `opencode` | Kind khi `agent start first-mate` |
| `REPLY_MAX_LINES` | — | `30` | Số dòng tối đa của reply gửi về Telegram |

File `.env.example`:

```
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
NOTIFY_POLL_INTERVAL_MS=5000
FIRST_MATE_AGENT_KIND=opencode
REPLY_MAX_LINES=30
```

> `.env`, `node_modules/`, `logs/*.log`, `state.json` đã nằm trong `.gitignore` — an toàn khi push.

## Sử dụng

Mở chat với bot trên Telegram:

| Nhắn | Bot làm gì |
|------|------------|
| `/status` | Trả về `tên: trạng thái (workspace ...)` cho mọi agent |
| `/stop <name>` | `herdr worktree remove --workspace <id> --force` cho agent đó |
| `/firstmate` | Trạng thái + viewport hiện tại của `first-mate` (read-only) |
| `1` / `2` / `3`... (khi blocked) | Chọn option N trong menu của `first-mate` |
| `ok` / `allow` / `yes` (khi blocked) | Gửi Enter cho `first-mate` |
| `reject` / `no` / `esc` (khi blocked) | Gửi Esc cho `first-mate` |
| Bất kỳ text nào khác | Forward cho `first-mate`, chờ tới `idle`/`done`/`blocked` (timeout 10 phút), trả reply đã làm sạch |

Tin nhắn lạ khi `first-mate` đang blocked không được forward — bot trả hướng dẫn ("nhắn số option, hoặc ok/reject").

## Chạy nền trên Windows (Task Scheduler)

Repo có sẵn `run-task.ps1`: dựng `PATH` cho Node + Herdr + jq, chạy `node index.js`, ghi `logs/stdout.log` và `logs/stderr.log`.

Sửa 3 đường dẫn đầu file cho đúng máy bạn (`$NodeDir`, `$HerdrDir`, `$JqDir`), rồi tạo task:

```powershell
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"C:\path\to\shipmate-telegram\run-task.ps1`""
$Trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName "shipmate-telegram" -Action $Action -Trigger $Trigger -RunLevel Highest
Start-ScheduledTask -TaskName "shipmate-telegram"
```

Log chi tiết bot ở `logs/bot.log`.

## Cấu trúc project

```
index.js          # entrypoint, đọc .env, gọi startBot
run-task.ps1      # wrapper cho Task Scheduler
src/
  bot.js          # Telegram polling, router message (/status, /stop, /firstmate, blocked, forward), poll notifier
  commands.js     # parseCommand, formatStatusMessage, handleStopCommand, resolveBlockedKeys
  firstMate.js    # ensureFirstMate, promptFirstMate, readFirstMateViewport, TELEGRAM_DIRECTIVE
  herdr.js        # wrapper execFile herdr + parse JSON + HerdrError
  notifier.js     # diffAgentStatuses (blocked/finished, bỏ qua first-mate)
  state.js        # lưu firstMateWorkspaceId/PaneId vào state.json
  textClean.js    # cleanTerminalText + summarizeReply
  *.test.js       # unit test (node:test)
```

## Test

```powershell
npm test
```

Dùng `node --test "src/**/*.test.js"`, không cần dependency ngoài. Hiện tại 59 tests.

## Troubleshooting

- `Missing required environment variable` → chưa tạo `.env` hoặc thiếu `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`.
- Bot không trả lời → kiểm tra `logs/bot.log`, chắc chắn `herdr agent list` chạy được bằng user chạy bot.
- `First-mate is currently busy...` → prompt trước chưa xong (timeout tối đa 10 phút), đợi rồi nhắn lại.
- `Error: agent first-mate is blocked...` khi nhắn text thường → first-mate đang kẹt ở dialog, dùng `/firstmate` để xem nó đang hiện gì rồi nhắn số option / ok / reject.
- Poll báo ồn / miss → chỉnh `NOTIFY_POLL_INTERVAL_MS`, bot chỉ báo khi trạng thái đổi từ lần poll trước (agent mới thấy lần đầu không báo).

## License

Private — dùng nội bộ.
