# GitHub Actions 자동화 설정 - 빠른 시작 가이드

## ✅ 완료된 작업

다음 파일들이 생성되었습니다:

- `.github/workflows/weekly-hit-analysis.yml` - 워크플로우 정의
- `.github/workflows/README.md` - 상세 설명서
- `.claude/mcp.json` - MCP 서버 환경변수 설정
- `.gitignore` - 민감 정보 보호

---

## 🚀 설정 단계 (5분 소요)

### 1단계: GitHub에 Push

```bash
cd "c:\Users\라포랩스\claude code_1"

# 변경사항 확인
git status

# 파일 추가
git add .github/ .claude/mcp.json .gitignore SETUP_GITHUB_ACTIONS.md

# 커밋
git commit -m "Add GitHub Actions automation for weekly hit product analysis"

# Push (브랜치명 확인 필요: main 또는 master)
git push origin main
```

---

### 2단계: GitHub Secrets 설정

#### 2-1. ANTHROPIC_API_KEY

1. https://github.com/YOUR_USERNAME/YOUR_REPO/settings/secrets/actions 접속
2. **New repository secret** 클릭
3. 정보 입력:
   - **Name**: `ANTHROPIC_API_KEY`
   - **Secret**: https://console.anthropic.com/settings/keys 에서 API 키 발급 후 입력
4. **Add secret** 클릭

#### 2-2. NOTION_TOKEN

1. Notion Integration 생성: https://www.notion.so/my-integrations
2. **New repository secret** 클릭
3. 정보 입력:
   - **Name**: `NOTION_TOKEN`
   - **Secret**: Integration Token 복사 붙여넣기
4. **Add secret** 클릭

**중요**: 데이터베이스 `2c9466b6209980aaada8cffdefa18471`에 Integration 연결 필수!

#### 2-3. SLACK_BOT_TOKEN

1. Slack App 설정: https://api.slack.com/apps
2. **OAuth & Permissions** → **Bot User OAuth Token** 복사
3. **New repository secret** 클릭
4. 정보 입력:
   - **Name**: `SLACK_BOT_TOKEN`
   - **Secret**: xoxb-로 시작하는 토큰 입력
5. **Add secret** 클릭

**중요**: Bot을 `#biz-pb-alert-test` 채널에 초대 필수!

#### 2-4. BIGQUERY_CREDENTIALS

1. Google Cloud Console → IAM & Admin → Service Accounts
2. 서비스 계정 생성 및 JSON 키 다운로드
3. 키 파일 열어서 **전체 내용** 복사
4. **New repository secret** 클릭
5. 정보 입력:
   - **Name**: `BIGQUERY_CREDENTIALS`
   - **Secret**: JSON 전체 내용 붙여넣기
6. **Add secret** 클릭

**권한 필요**: BigQuery Data Viewer, BigQuery Job User

---

### 3단계: 워크플로우 권한 설정

1. https://github.com/YOUR_USERNAME/YOUR_REPO/settings/actions 접속
2. **Workflow permissions** 섹션에서:
   - ✅ **Read and write permissions** 선택
   - ✅ **Allow GitHub Actions to create and approve pull requests** 체크
3. **Save** 클릭

---

### 4단계: 수동 테스트 실행

자동 실행 전에 먼저 수동으로 테스트합니다:

1. https://github.com/YOUR_USERNAME/YOUR_REPO/actions 접속
2. 왼쪽 **Weekly Hit Product Analysis** 클릭
3. 오른쪽 **Run workflow** 버튼 클릭
4. **Run workflow** 확인
5. 실행 완료 대기 (약 3-5분)

**확인사항**:
- ✅ Notion에 리포트 생성됨
- ✅ Slack 알림 전송됨
- ✅ Artifacts에 스냅샷 업로드됨

---

## 📅 자동 실행 일정

- **매주 월요일 오전 9:00** (한국 시간)
- UTC 기준: 매주 월요일 00:00

다음 실행 예정: **2026-01-12 (월) 09:00**

---

## 🔍 결과 확인 방법

### Notion 리포트
- 데이터베이스: https://www.notion.so/2c9466b6209980aaada8cffdefa18471
- 최신 페이지 확인

### Slack 알림
- 채널: `#biz-pb-alert-test`
- 매주 월요일 오전 9시 알림 수신

### GitHub Actions 로그
- https://github.com/YOUR_USERNAME/YOUR_REPO/actions
- 각 실행 기록 클릭 → 로그 확인

---

## 💰 예상 비용

| 항목 | 비용 |
|------|------|
| GitHub Actions | 무료 (Public repo) 또는 월 2,000분 무료 |
| Anthropic API | 실행당 $0.50-$2.00 |
| **월간 총 비용** | **약 $2-$8** (주 1회 × 4주) |

---

## ❓ 문제 해결

### "MCP connection failed" 에러
→ GitHub Secrets 값 확인 (특히 JSON 포맷)

### "Permission denied" 에러
→ 3단계 워크플로우 권한 설정 확인

### 결과물이 생성되지 않음
→ Actions 탭에서 로그 확인, MCP 연결 상태 체크

---

## 📚 추가 자료

- [상세 README](.github/workflows/README.md)
- [Claude Code GitHub Actions 문서](https://code.claude.com/docs/en/github-actions.md)
- [Anthropic API 문서](https://docs.anthropic.com)

---

## ✨ 완료 후 확인사항

- [ ] GitHub에 Push 완료
- [ ] 4개 Secrets 설정 완료
- [ ] 워크플로우 권한 설정 완료
- [ ] 수동 테스트 실행 성공
- [ ] Notion 리포트 생성 확인
- [ ] Slack 알림 수신 확인
- [ ] 다음 월요일 자동 실행 대기

모든 체크박스 완료 시 설정 완료! 🎉
