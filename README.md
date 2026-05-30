# TOEIC RC Telegram Bot

Telegram에서 TOEIC RC 문법 학습을 테스트하기 위한 봇입니다.

현재 테스트 버전은 모든 사용자를 유료 사용자처럼 처리합니다.

- `/learn`: 학습 60문제 시작 또는 이어풀기
- `/mock`: 학습 60문제 완료 후 모의 퀴즈 10문제
- `/status`: 진행도 확인
- `/wrong`: 오답 확인
- `/reset`: 내 테스트 기록 초기화

## Local Run

Node.js 18 이상이 필요합니다.

```powershell
$env:TELEGRAM_BOT_TOKEN="123456:ABC..."
npm start
```

실행 시 다음 로그가 보이면 문제 데이터가 정상 로드된 것입니다.

```text
TOEIC RC bot started with 60 learning questions and 10 mock questions.
```

## Test Question Set

테스트 문제는 `TEST_70_QUESTIONS.md`에 있습니다.

- 학습용 60문제
- 모의 퀴즈 10문제
- 학생 풀이 중 OpenAI API 호출 없음

## GitHub Upload

처음 한 번:

```bash
git init
git add .
git commit -m "Initial TOEIC RC Telegram bot"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPO.git
git push -u origin main
```

이미 GitHub 저장소를 만든 뒤 `YOUR_ACCOUNT/YOUR_REPO`만 바꿔서 실행하면 됩니다.

## VPS Deploy

Ubuntu VPS 기준 예시입니다.

### 1. Node.js 설치

```bash
node --version
```

Node.js 18 이상이 아니면 설치합니다.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. 봇 계정과 디렉터리 준비

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin toeicbot
sudo mkdir -p /opt/toeic-rc-bot
sudo chown -R toeicbot:toeicbot /opt/toeic-rc-bot
```

### 3. 코드 받기

```bash
sudo -u toeicbot git clone https://github.com/YOUR_ACCOUNT/YOUR_REPO.git /opt/toeic-rc-bot
```

### 4. 환경변수 설정

```bash
sudo nano /opt/toeic-rc-bot/.env
```

내용:

```text
TELEGRAM_BOT_TOKEN=123456:ABC...
```

권한:

```bash
sudo chown toeicbot:toeicbot /opt/toeic-rc-bot/.env
sudo chmod 600 /opt/toeic-rc-bot/.env
```

### 5. systemd 등록

```bash
sudo cp /opt/toeic-rc-bot/deploy/toeic-rc-bot.service /etc/systemd/system/toeic-rc-bot.service
sudo systemctl daemon-reload
sudo systemctl enable toeic-rc-bot
sudo systemctl start toeic-rc-bot
```

상태 확인:

```bash
sudo systemctl status toeic-rc-bot
sudo journalctl -u toeic-rc-bot -f
```

### 6. 업데이트

```bash
cd /opt/toeic-rc-bot
sudo -u toeicbot git pull
sudo systemctl restart toeic-rc-bot
```

## Telegram Setup

1. Telegram에서 `@BotFather`에게 `/newbot`을 보냅니다.
2. 봇 이름과 username을 정합니다.
3. BotFather가 준 token을 VPS의 `/opt/toeic-rc-bot/.env`에 넣습니다.
4. systemd 서비스를 재시작합니다.

```bash
sudo systemctl restart toeic-rc-bot
```
