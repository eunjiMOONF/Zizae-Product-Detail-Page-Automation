# GitHub Actions 자동화 설정 가이드

## 개요

매주 월요일 오전 9시(한국 시간)에 적중상품 주간 분석을 자동으로 실행하는 GitHub Actions 워크플로우입니다.

## 설정 방법

### 1. GitHub Repository에 Push

```bash
git add .github/workflows/weekly-hit-analysis.yml
git commit -m "Add weekly hit product analysis automation"
git push origin main
```

### 2. ANTHROPIC_API_KEY 시크릿 설정

1. GitHub Repository 페이지로 이동
2. **Settings** → **Secrets and variables** → **Actions** 클릭
3. **New repository secret** 클릭
4. 다음 정보 입력:
   - **Name**: `ANTHROPIC_API_KEY`
   - **Secret**: Anthropic API 키 (https://console.anthropic.com/settings/keys 에서 발급)
5. **Add secret** 클릭

### 3. MCP 서버 설정 (필수)

GitHub Actions 환경에서 MCP 서버(Notion, Slack, BigQuery)를 사용하려면 추가 설정이 필요합니다:

#### 3-1. Notion Integration Token

1. **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret**:
   - **Name**: `NOTION_TOKEN`
   - **Secret**: Notion Integration Token

#### 3-2. Slack Bot Token

1. **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret**:
   - **Name**: `SLACK_BOT_TOKEN`
   - **Secret**: Slack Bot User OAuth Token

#### 3-3. BigQuery 서비스 계정

1. Google Cloud Console에서 서비스 계정 JSON 키 생성
2. **Settings** → **Secrets and variables** → **Actions**
3. **New repository secret**:
   - **Name**: `BIGQUERY_CREDENTIALS`
   - **Secret**: JSON 키 내용 (전체 복사)

### 4. MCP 설정 파일 추가

`.claude/mcp.json` 파일에 환경변수 기반 설정 추가:

```json
{
  "mcpServers": {
    "notion": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-notion"],
      "env": {
        "NOTION_API_KEY": "${NOTION_TOKEN}"
      }
    },
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "${SLACK_BOT_TOKEN}"
      }
    },
    "bigquery": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-bigquery"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS_JSON": "${BIGQUERY_CREDENTIALS}"
      }
    }
  }
}
```

## 실행 일정

- **자동 실행**: 매주 월요일 오전 9:00 (한국 시간)
- **수동 실행**: GitHub Actions 탭에서 "Run workflow" 버튼으로 즉시 실행 가능

## 실행 결과 확인

1. GitHub Repository → **Actions** 탭
2. **Weekly Hit Product Analysis** 워크플로우 클릭
3. 최근 실행 기록 확인
4. 로그 다운로드: **Artifacts** → `analysis-logs-{실행번호}`

## 출력물

자동화 실행 시 다음 결과물이 생성됩니다:

1. **Notion 리포트**: `2c9466b6209980aaada8cffdefa18471` 데이터베이스
2. **Slack 알림**: `#biz-pb-alert-test` (C0A3GLY3K34) 채널
3. **스냅샷 파일**: `week2-brand-analysis/snapshots/YYYY-MM-DD-hit-products.csv`

## 문제 해결

### MCP 연결 실패 시

1. 시크릿 값이 올바른지 확인
2. `.claude/mcp.json` 파일의 환경변수 매핑 확인
3. Actions 탭에서 로그 확인

### 워크플로우가 실행되지 않을 때

1. Repository의 **Settings** → **Actions** → **General**
2. **Workflow permissions**에서 "Read and write permissions" 선택
3. **Allow GitHub Actions to create and approve pull requests** 체크

## 비용

- **GitHub Actions**: 월 2,000분 무료 (Public Repository는 무료)
- **Anthropic API**: 실행당 약 $0.50 - $2.00 예상 (모델 및 사용량에 따라 다름)
- **월간 예상 비용**: $2 - $8 (주 1회 × 4주)

## 참고 자료

- [Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions.md)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Anthropic API Pricing](https://www.anthropic.com/pricing)
