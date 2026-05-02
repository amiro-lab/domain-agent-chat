# domain-agent-chat

ChatGPT·Claude.ai 브라우저 대화에서 팀 도메인 지식을 자동으로 추출·공유하는 데스크톱 앱.

## 다운로드

| OS | 파일 |
|----|------|
| macOS (Apple Silicon / Intel) | `domain-agent-chat-x.y.z.dmg` |
| Windows 10/11 | `domain-agent-chat-Setup-x.y.z.exe` |

[GitHub Releases](https://github.com/your-org/domain-agent-chat/releases)에서 최신 버전 다운로드.

## 설치

### macOS

1. DMG 파일을 열고 앱을 Applications 폴더로 드래그
2. 첫 실행 시 "확인되지 않은 개발자" 경고 → 시스템 설정 → 개인 정보 보호 및 보안 → "허용"

### Windows

1. `domain-agent-chat-Setup-x.y.z.exe` 실행
2. 바탕화면 바로가기 생성 선택 후 설치 완료

## 초기 설정

앱 첫 실행 시 4단계 설정 마법사가 표시됩니다:

1. **서버 URL** 입력 (팀 관리자에게 문의)
2. **팀 선택** (서버에 등록된 팀 목록)
3. **이름·이메일·초대 코드** 입력
4. 설정 완료 → 자동으로 Chrome 실행

## 사용 방법

설정 완료 후 상태 창이 표시됩니다:

- **Chrome 열기** — ChatGPT·Claude.ai가 열린 Chrome 실행
- 대화가 완료되면 자동으로 서버에 전송 → 도메인 지식 추출

팀 도메인 대시보드는 관리자가 제공한 서버 URL에서 확인할 수 있습니다.

## domain-agent (CLI)와의 차이

| | domain-agent | domain-agent-chat |
|--|--|--|
| **대상** | Claude Code 사용자 | 브라우저(ChatGPT·Claude.ai) 사용자 |
| **플랫폼** | macOS / Linux CLI | macOS / Windows 데스크톱 앱 |
| **동작** | Claude Code 후크로 자동 실행 | Chrome 원격 디버깅(CDP)으로 캡처 |
| **설정 파일** | `~/.claude/domain-agent/config.json` | 동일 경로 공유 |

두 도구 모두 같은 팀 서버에 연결하여 지식을 공유합니다.

## 개발

```bash
git clone https://github.com/your-org/domain-agent-chat.git
cd domain-agent-chat
npm install
npm start
```

### 빌드

```bash
# macOS DMG
npm run build:mac

# Windows NSIS 설치 파일 (Windows 환경 또는 GitHub Actions)
npm run build:win
```

GitHub Actions가 태그 푸시 시 자동으로 양 플랫폼 빌드 후 Release에 첨부합니다.

## 환경 요구사항

- macOS 12+ 또는 Windows 10+
- Google Chrome (자동 탐지)
- 팀 서버 접근 권한 (관리자 발급 초대 코드)
