# PB 브랜드 성과 분석 프로젝트

이 문서는 Claude Code가 프로젝트를 이해하고 효과적으로 작업할 수 있도록 돕는 가이드입니다.

## 프로젝트 설명

PB(Private Brand) 브랜드들의 판매 성과를 분석하고 시각화하는 데이터 분석 프로젝트입니다.
BigQuery를 활용하여 각 브랜드의 매출, 전환율, 고객 반응 등의 핵심 지표를 추적하고 분석합니다.

## 데이터 소스

### BigQuery 설정

#### 주요 테이블
1. **적중상품 분석 테이블**: `damoa-mart.pb1.pb_new_product_check` ⭐ **적중상품 모니터링 시 사용**
2. **성과 분석 테이블**: `damoa-mart.biz_analytics.product_funnel_daily`
3. **재고 테이블**: `damoa-lake.logistics_owned.stockDetail_raw`

---

## 테이블 구조

### 1. 적중상품 분석 테이블 ⭐
**테이블명**: `damoa-mart.pb1.pb_new_product_check`
**용도**: PB 브랜드 신상품 성과 추적 및 적중상품 판정
**특징**: 주간 스냅샷 데이터 (gmv_last_7d, gmv_last_8_14d 등)
**업데이트**: 주 1회

#### 주요 컬럼

| 컬럼명 | 타입 | 설명 |
|--------|------|------|
| `brand_name` | STRING | 브랜드명 |
| `mall_product_code` | STRING | 몰 상품 코드 |
| `display_title` | STRING | 상품명 |
| `season_cohort` | STRING | 시즌 (예: '2025 FW', '2026 SS') |
| `launch_date` | DATE | 상품 출시일 |
| `unique_ctg_name` | STRING | 카테고리 (예: '아우터/코트/롱 코트') |
| `representative_price_segment` | STRING | 가격대 세그먼트 |
| **`gmv_threshold`** | FLOAT | ⭐ **적중상품 임계값** (카테고리/가격대별) |
| **`gmv_last_7d`** | INT | ⭐ **최근 7일 GMV** (이번주) |
| **`gmv_last_8_14d`** | INT | ⭐ **8-14일 전 GMV** (전주) |
| `gmv_season_total` | INT | 시즌 누적 GMV |
| `ctr_last_7d` | FLOAT | 최근 7일 CTR |
| `spv_last_7d` | FLOAT | 최근 7일 SPV |
| `A_Player_status` | STRING | 적중상품 여부 ('A_Player' 등) |

#### 적중상품 판정 기준 ⚠️ 중요!
```sql
-- 적중상품: 시즌 누적 GMV가 임계값 이상
WHERE gmv_season_total >= gmv_threshold
```

**주의**: 주간 GMV(`gmv_last_7d`)가 아닌 **시즌 누적 GMV(`gmv_season_total`)** 기준!

#### 시즌 누적 적중상품 조회 예시
```sql
-- 시즌 누적 기준 적중상품 (신상 vs 재진행)
SELECT
  brand_name,
  -- 신상 적중 (mall_product_code 뒤 3자리 < 900)
  COUNT(DISTINCT CASE
    WHEN CAST(REGEXP_EXTRACT(mall_product_code, r'(\d{3})$') AS INT64) < 900
      AND gmv_season_total >= gmv_threshold
    THEN mall_product_code
  END) AS new_hit,
  -- 재진행 적중 (mall_product_code 뒤 3자리 >= 900)
  COUNT(DISTINCT CASE
    WHEN CAST(REGEXP_EXTRACT(mall_product_code, r'(\d{3})$') AS INT64) >= 900
      AND gmv_season_total >= gmv_threshold
    THEN mall_product_code
  END) AS relaunch_hit,
  -- 총 적중상품
  COUNT(DISTINCT CASE
    WHEN gmv_season_total >= gmv_threshold
    THEN mall_product_code
  END) AS total_hit,
  -- 적중률
  ROUND(SAFE_DIVIDE(
    COUNT(DISTINCT CASE WHEN gmv_season_total >= gmv_threshold THEN mall_product_code END),
    COUNT(DISTINCT mall_product_code)
  ) * 100, 2) AS hit_rate
FROM `damoa-mart.pb1.pb_new_product_check`
WHERE
  brand_name IN ('지재', '다나앤페타', '마치마라', '희애')
  AND season_cohort IN ('2025 FW', '2026 SS')
  AND launch_date >= '2025-08-01'
GROUP BY brand_name
ORDER BY total_hit DESC
```

---

### 2. 성과 분석 테이블
**테이블명**: `damoa-mart.biz_analytics.product_funnel_daily`
**용도**: 일별 상품 퍼널 성과 데이터 (조회수, 클릭수, 매출 등)

#### 전체 컬럼 목록

| 컬럼명 | 타입 | 설명 |
|--------|------|------|
| `dt` | DATE | 날짜 (**파티션 키, WHERE 필터 필수!**) |
| `item_id` | STRING | 상품 고유 ID |
| `mall_product_code` | STRING | 몰 상품 코드 |
| `product_name` | STRING | 상품명 |
| `brand_name` | STRING | 브랜드명 |
| `brand_code` | STRING | 브랜드 코드 |
| `seller_company_code` | STRING | 판매사 코드 |
| `ctg_v2_depth1` | STRING | 카테고리 대분류 |
| `ctg_v2_depth2` | STRING | 카테고리 중분류 |
| `ctg_v2_depth3` | STRING | 카테고리 소분류 |
| `ctg_v2_depth4` | STRING | 카테고리 세분류 |
| `final_price` | INTEGER | 최종 판매가 (원) |
| `discount_percentage` | INTEGER | 할인율 (%) |
| `thumbnail_url` | STRING | 썸네일 이미지 URL |
| `created_at` | TIMESTAMP | 상품 등록일시 |
| `sales_status` | STRING | 판매 상태 |
| `vcnt` | INTEGER | 조회수 (View Count) |
| `scnt` | INTEGER | 상세페이지 진입수 (Click Count) |
| `cart_cnt` | INTEGER | 장바구니 담기 수 |
| `buy_cnt` | INTEGER | 구매 완료 수 |
| `quantity` | INTEGER | 판매 수량 |
| `gmv` | INTEGER | 매출액 (Gross Merchandise Value, 원) |
| `opt_cnt` | INTEGER | 옵션 선택 수 |
| `chkout_cnt` | INTEGER | 결제 시작 수 |
| `add_to_wishlist_cnt` | INTEGER | 위시리스트 추가 수 |
| `filtered_vcnt` | INTEGER | 필터링된 조회수 |
| `filtered_gmv` | INTEGER | 필터링된 매출액 |
| `etl_time` | TIMESTAMP | ETL 처리 시간 |

---

### 3. 재고 테이블
**테이블명**: `damoa-lake.logistics_owned.stockDetail_raw`
**용도**: 실시간 재고 데이터
**특징**: 파티션 없음 (실시간 스냅샷)
**레코드 수**: 41,131개 (2025-12-14 기준)
**최종 수정**: 2025-12-14 23:48:50

#### 전체 컬럼 목록

| 컬럼명 | 타입 | 설명 |
|--------|------|------|
| `mallProductCode` | STRING | 몰 상품 코드 (product_funnel_daily의 mall_product_code와 조인) |
| `itemCode` | STRING | **SKU 코드** (옵션별 고유 코드, 색상/사이즈 등 구분) <br>⚠️ product_funnel_daily의 item_id와는 다른 식별자 |
| `Brand` | STRING | 브랜드명 (예: 마치마라, 지재, 다나앤페타 등) |
| `avaliableStock` | INTEGER | ⚠️ **가용 재고 수량** (오타: available → avaliable, 쿼리 작성 시 주의!) |
| `sales_status` | STRING | 판매 상태 (ACTIVE: 판매중, ARCHIVED: 아카이브 등) |

#### 주요 특징 및 주의사항

1. **파티션 없음**: 실시간 스냅샷 테이블이므로 WHERE 절에 날짜 필터 불필요
2. **옵션별 재고 관리**: 하나의 `mallProductCode`가 여러 `itemCode`(옵션)를 가질 수 있음
3. **컬럼명 오타**: `avaliableStock` (available의 오타) - 쿼리 작성 시 정확히 입력 필요
4. **SKU 코드**: `itemCode`는 `damoa-lake.ms_product.product_item` 테이블의 `product_item_code`와 동일

#### 주요 활용

- **재고 부족 상품 파악**: `avaliableStock = 0` 또는 낮은 재고
- **성과 분석 연계**: product_funnel_daily와 조인하여 재고 vs 성과 분석
- **품절 상품 모니터링**: 매출 높은데 재고 부족한 상품 찾기
- **옵션별 재고 현황**: itemCode 기준으로 색상/사이즈별 재고 추적

#### 조인 예시

**예시 1: 성과 데이터와 재고 데이터 조인 (상품별)**
```sql
-- 마치마라 브랜드 상품별 성과 + 재고 현황
SELECT
  p.mall_product_code,
  p.product_name,
  p.brand_name,
  SUM(p.gmv) AS total_gmv,  -- 총 매출
  SUM(p.quantity) AS total_quantity,  -- 총 판매 수량
  SUM(s.avaliableStock) AS total_stock,  -- 총 재고 (옵션별 합계)
  COUNT(DISTINCT s.itemCode) AS option_count,  -- 옵션 수
  s.sales_status
FROM
  `damoa-mart.biz_analytics.product_funnel_daily` p
LEFT JOIN
  `damoa-lake.logistics_owned.stockDetail_raw` s
ON
  p.mall_product_code = s.mallProductCode
WHERE
  p.dt BETWEEN '2025-12-01' AND '2025-12-10'  -- 파티션 필터
  AND p.brand_name = '마치마라'
  AND s.sales_status = 'ACTIVE'  -- 판매중 상품만
GROUP BY
  p.mall_product_code, p.product_name, p.brand_name, s.sales_status
ORDER BY
  total_gmv DESC
```

**예시 2: 재고 부족 고성과 상품 찾기**
```sql
-- 매출은 높은데 재고가 부족한 상품 (긴급 발주 대상)
SELECT
  p.mall_product_code,
  p.product_name,
  p.brand_name,
  SUM(p.gmv) AS total_gmv,
  SUM(p.quantity) AS total_quantity,
  SUM(s.avaliableStock) AS total_stock,
  ROUND(SAFE_DIVIDE(SUM(s.avaliableStock), SUM(p.quantity)), 2) AS stock_sales_ratio  -- 재고/판매 비율
FROM
  `damoa-mart.biz_analytics.product_funnel_daily` p
LEFT JOIN
  `damoa-lake.logistics_owned.stockDetail_raw` s
ON
  p.mall_product_code = s.mallProductCode
WHERE
  p.dt BETWEEN '2025-12-01' AND '2025-12-10'
  AND p.brand_name = '마치마라'
  AND s.sales_status = 'ACTIVE'
GROUP BY
  p.mall_product_code, p.product_name, p.brand_name
HAVING
  SUM(p.gmv) > 1000000  -- 매출 100만원 이상
  AND SUM(s.avaliableStock) < 50  -- 재고 50개 미만
ORDER BY
  total_gmv DESC
```

**예시 3: 옵션별 재고 상세 조회**
```sql
-- 특정 상품의 옵션별 재고 현황 (SKU 레벨)
SELECT
  s.mallProductCode,
  s.itemCode,  -- SKU 코드
  s.Brand,
  s.avaliableStock,  -- 옵션별 재고
  s.sales_status
FROM
  `damoa-lake.logistics_owned.stockDetail_raw` s
WHERE
  s.mallProductCode = 'YOUR_PRODUCT_CODE'  -- 상품 코드 입력
  AND s.sales_status = 'ACTIVE'
ORDER BY
  s.avaliableStock DESC
```

---

## 회사 브랜드 목록

### PB1팀
- **다나앤페타** (Dana&Peta)
- **지재** (Jijae)
- **마치마라** (Matchimara)
- **아르앙** (Arrang)
- **희애** (Heeae)

### PB2팀
- **노어** (Noar)
- **베르다** (Verda)
- **브에트와** (Buetwa)
- **퀸즈셀렉션** (Queens Selection)

### 기타
- **지재투원** (Jijae2Won) - 지재 서브 브랜드

## 핵심 분석 지표

### 1. CTR (Click-Through Rate) - 상세페이지 전환율
```sql
-- CTR 계산: 조회수 대비 상세페이지 클릭률
SAFE_DIVIDE(scnt, vcnt) * 100
```
- **의미**: 상품을 조회한 고객 중 상세페이지로 진입한 비율
- **단위**: %
- **업계 평균**: 2-4%

### 2. CVR (Conversion Rate) - 구매전환율
```sql
-- CVR 계산: 상세페이지 진입 대비 구매 완료율
SAFE_DIVIDE(buy_cnt, scnt) * 100
```
- **의미**: 상세페이지를 본 고객 중 실제 구매한 비율
- **단위**: %
- **업계 평균**: 1-3%

### 3. SPV (Sales Per View) - 조회당 매출
```sql
-- SPV 계산: 조회수 대비 매출액
SAFE_DIVIDE(gmv, vcnt)
```
- **의미**: 조회 1회당 발생한 평균 매출
- **단위**: 원

### 4. WoW (Week over Week) - 전주 대비 성장률
```sql
-- WoW 계산: 전주 대비 증감률
SAFE_DIVIDE((이번주 값 - 지난주 값), 지난주 값) * 100
```
- **의미**: 전주 대비 성과 증감률
- **단위**: %

### 5. 추가 지표

#### 전환 관련 지표
- **Cart Rate**: `SAFE_DIVIDE(cart_cnt, scnt) * 100` - 장바구니 담기율
- **ARPV (Average Revenue Per View)**: `SAFE_DIVIDE(gmv, vcnt)` - 조회당 평균 매출
- **ASP (Average Selling Price)**: `SAFE_DIVIDE(gmv, quantity)` - 평균 판매가

#### 상품 등급 분류

**적중상품 (Hit Product)**
```sql
-- 적중상품 판정: GMV 기준 상위 0.5% 상품
PERCENT_RANK() OVER (ORDER BY total_gmv DESC) <= 0.005
```
- **정의**: 전체 상품 중 GMV(매출) 기준 **상위 0.5%** 상품
- **시즌**: 25FW (2025 Fall/Winter) 기준
- **출처**: PB1팀 OKR 대시보드 (신정현 팀장, 2025-12-02)
- **의미**: 매출 성과가 탁월한 핵심 상품
- **활용**: 재고 우선 확보, 프로모션 강화, 성공 요인 분석

#### 재고 관련 지표

**재고 회전율 (Stock Turnover Ratio)**
```sql
-- 재고 회전율: 판매 수량 대비 재고 비율 (낮을수록 좋음)
SAFE_DIVIDE(SUM(stock.avaliableStock), SUM(sales.quantity))
```
- **의미**: 현재 재고가 판매 수량의 몇 배인지 (재고 효율성)
- **단위**: 배수 (예: 2.0 = 재고가 판매량의 2배)
- **적정 수준**: 1.0~2.0 (너무 높으면 과다 재고, 너무 낮으면 품절 위험)

**품절률 (Out of Stock Rate)**
```sql
-- 품절률: 재고 0인 SKU 비율
SAFE_DIVIDE(
  COUNT(CASE WHEN avaliableStock = 0 THEN 1 END),
  COUNT(*)
) * 100
```
- **의미**: 전체 SKU 중 품절된 비율
- **단위**: %
- **목표**: 5% 이하

**재고 가용성 (Stock Availability)**
```sql
-- 재고 가용성: 판매중 상품 중 재고 있는 비율
SAFE_DIVIDE(
  COUNT(CASE WHEN avaliableStock > 0 AND sales_status = 'ACTIVE' THEN 1 END),
  COUNT(CASE WHEN sales_status = 'ACTIVE' THEN 1 END)
) * 100
```
- **의미**: 판매중 상품 중 실제 구매 가능한 상품 비율
- **단위**: %
- **목표**: 95% 이상

## SQL 작성 규칙

### 필수 규칙

| 규칙 | 설명 | 예시 |
|------|------|------|
| **1. dt 파티션 필터 필수** | WHERE 절에 `dt` 필터 없으면 전체 스캔 (비용 폭증!) | `WHERE dt BETWEEN '2025-12-01' AND '2025-12-10'` |
| **2. SAFE_DIVIDE 사용** | 0으로 나누기 방지 (NULLIF 대신 사용) | `SAFE_DIVIDE(scnt, vcnt) * 100` |
| **3. 한글 주석 필수** | 모든 주요 로직에 한글 주석 작성 | `-- 조회수 대비 클릭률 계산` |
| **4. 날짜 형식** | YYYY-MM-DD 형식 사용 | `'2025-12-10'` |
| **5. 결과는 마크다운 테이블** | 분석 결과는 마크다운 테이블로 출력 | (아래 예시 참조) |

### SQL 예시

```sql
-- 일별 브랜드 성과 분석 (CTR, CVR 포함)
SELECT
  dt,  -- 날짜
  brand_name,  -- 브랜드명
  SUM(vcnt) AS total_views,  -- 총 조회수
  SUM(scnt) AS total_clicks,  -- 총 클릭수
  SUM(buy_cnt) AS total_buys,  -- 총 구매수
  SUM(gmv) AS total_gmv,  -- 총 매출
  ROUND(SAFE_DIVIDE(SUM(scnt), SUM(vcnt)) * 100, 2) AS ctr,  -- CTR (%)
  ROUND(SAFE_DIVIDE(SUM(buy_cnt), SUM(scnt)) * 100, 2) AS cvr,  -- CVR (%)
  ROUND(SAFE_DIVIDE(SUM(gmv), SUM(vcnt)), 0) AS spv  -- SPV (원)
FROM
  `damoa-mart.biz_analytics.product_funnel_daily`
WHERE
  dt BETWEEN '2025-12-03' AND '2025-12-09'  -- 파티션 필터 (필수!)
  AND brand_name IN ('마치마라', '지재', '다나앤페타')  -- 브랜드 필터
GROUP BY
  dt, brand_name
ORDER BY
  dt DESC, total_gmv DESC
```

### 결과 출력 형식

```markdown
| 날짜 | 브랜드명 | 조회수 | 클릭수 | 구매수 | 매출 | CTR(%) | CVR(%) | SPV(원) |
|------|---------|--------|--------|--------|------|--------|--------|---------|
| 2025-12-09 | 마치마라 | 10,000 | 500 | 15 | 1,000,000 | 5.0 | 3.0 | 100 |
```

## 브랜드 코드 매핑

```python
BRAND_CODES = {
    'matchimara': '마치마라',
    'jijae': '지재',
    'dana_peta': '다나앤페타',
    'arrang': '아르앙',
    'heeae': '희애',
    'noar': '노어',
    'buetwa': '브에트와',
    'jijae2won': '지재투원',
    'verda': '베르다',
    'queens_selection': '퀸즈셀렉션'
}
```

## 자주 사용하는 분석 쿼리

### 이번 주 브랜드별 성과
```sql
-- 이번 주(최근 7일) 브랜드별 핵심 지표
SELECT
  brand_name,  -- 브랜드명
  SUM(vcnt) AS total_views,  -- 총 조회수
  SUM(scnt) AS total_clicks,  -- 총 클릭수
  SUM(buy_cnt) AS total_buys,  -- 총 구매수
  SUM(gmv) AS total_gmv,  -- 총 매출
  ROUND(SAFE_DIVIDE(SUM(scnt), SUM(vcnt)) * 100, 2) AS ctr,  -- CTR (%)
  ROUND(SAFE_DIVIDE(SUM(buy_cnt), SUM(scnt)) * 100, 2) AS cvr,  -- CVR (%)
  ROUND(SAFE_DIVIDE(SUM(gmv), SUM(vcnt)), 0) AS spv  -- SPV (원)
FROM
  `damoa-mart.biz_analytics.product_funnel_daily`
WHERE
  dt BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND CURRENT_DATE()  -- 파티션 필터
GROUP BY
  brand_name
ORDER BY
  total_gmv DESC
```

### WoW 성장률 분석
```sql
-- 이번 주 vs 지난 주 성과 비교
WITH this_week AS (
  -- 이번 주 데이터 (최근 7일)
  SELECT
    brand_name,
    SUM(vcnt) AS total_views,
    SUM(scnt) AS total_clicks,
    SUM(buy_cnt) AS total_buys,
    SUM(gmv) AS total_gmv
  FROM `damoa-mart.biz_analytics.product_funnel_daily`
  WHERE dt BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND CURRENT_DATE()  -- 파티션 필터
  GROUP BY brand_name
),
last_week AS (
  -- 지난 주 데이터 (8~14일 전)
  SELECT
    brand_name,
    SUM(vcnt) AS total_views,
    SUM(scnt) AS total_clicks,
    SUM(buy_cnt) AS total_buys,
    SUM(gmv) AS total_gmv
  FROM `damoa-mart.biz_analytics.product_funnel_daily`
  WHERE dt BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 8 DAY)  -- 파티션 필터
  GROUP BY brand_name
)
SELECT
  t.brand_name,
  -- 지난주
  l.total_views AS last_week_views,
  l.total_clicks AS last_week_clicks,
  l.total_buys AS last_week_buys,
  l.total_gmv AS last_week_gmv,
  -- 이번주
  t.total_views AS this_week_views,
  t.total_clicks AS this_week_clicks,
  t.total_buys AS this_week_buys,
  t.total_gmv AS this_week_gmv,
  -- WoW 성장률
  ROUND(SAFE_DIVIDE(t.total_views - l.total_views, l.total_views) * 100, 2) AS views_wow,
  ROUND(SAFE_DIVIDE(t.total_clicks - l.total_clicks, l.total_clicks) * 100, 2) AS clicks_wow,
  ROUND(SAFE_DIVIDE(t.total_buys - l.total_buys, l.total_buys) * 100, 2) AS buys_wow,
  ROUND(SAFE_DIVIDE(t.total_gmv - l.total_gmv, l.total_gmv) * 100, 2) AS gmv_wow
FROM this_week t
LEFT JOIN last_week l ON t.brand_name = l.brand_name
ORDER BY gmv_wow DESC
```

### PB팀별 성과 비교
```sql
-- PB1팀 vs PB2팀 성과 비교 (최근 7일)
SELECT
  CASE
    WHEN brand_name IN ('다나앤페타', '지재', '마치마라', '아르앙', '희애') THEN 'PB1팀'
    WHEN brand_name IN ('노어', '베르다', '브에트와', '퀸즈셀렉션') THEN 'PB2팀'
    ELSE '기타'
  END AS team,  -- 팀 구분
  SUM(vcnt) AS total_views,  -- 총 조회수
  SUM(scnt) AS total_clicks,  -- 총 클릭수
  SUM(buy_cnt) AS total_buys,  -- 총 구매수
  SUM(gmv) AS total_gmv,  -- 총 매출
  ROUND(SAFE_DIVIDE(SUM(scnt), SUM(vcnt)) * 100, 2) AS ctr,  -- CTR (%)
  ROUND(SAFE_DIVIDE(SUM(buy_cnt), SUM(scnt)) * 100, 2) AS cvr  -- CVR (%)
FROM
  `damoa-mart.biz_analytics.product_funnel_daily`
WHERE
  dt BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND CURRENT_DATE()  -- 파티션 필터
GROUP BY
  team
ORDER BY
  total_gmv DESC
```

### 브랜드별 재고 현황 분석
```sql
-- 브랜드별 재고 현황 및 품절률 (⚠️ 컬럼명 오타 주의: avaliableStock)
SELECT
  Brand AS brand_name,  -- 브랜드명
  COUNT(DISTINCT mallProductCode) AS product_count,  -- 상품 수
  COUNT(itemCode) AS sku_count,  -- 총 SKU 수
  SUM(avaliableStock) AS total_stock,  -- 총 재고
  ROUND(AVG(avaliableStock), 0) AS avg_stock_per_sku,  -- SKU당 평균 재고
  -- 품절률 계산
  ROUND(SAFE_DIVIDE(
    COUNT(CASE WHEN avaliableStock = 0 THEN 1 END),
    COUNT(*)
  ) * 100, 2) AS out_of_stock_rate,  -- 품절률 (%)
  -- 재고 가용성
  ROUND(SAFE_DIVIDE(
    COUNT(CASE WHEN avaliableStock > 0 AND sales_status = 'ACTIVE' THEN 1 END),
    COUNT(CASE WHEN sales_status = 'ACTIVE' THEN 1 END)
  ) * 100, 2) AS stock_availability  -- 재고 가용성 (%)
FROM
  `damoa-lake.logistics_owned.stockDetail_raw`
WHERE
  Brand IN ('마치마라', '지재', '다나앤페타', '베르다', '노어')  -- PB 브랜드 필터
GROUP BY
  Brand
ORDER BY
  total_stock DESC
```

### 재고 부족 긴급 발주 대상 상품
```sql
-- 최근 7일 매출 높은데 재고 부족한 상품 (긴급 발주 필요)
SELECT
  p.brand_name,
  p.mall_product_code,
  p.product_name,
  SUM(p.gmv) AS weekly_gmv,  -- 주간 매출
  SUM(p.quantity) AS weekly_quantity,  -- 주간 판매 수량
  SUM(s.avaliableStock) AS current_stock,  -- 현재 재고
  -- 재고/판매 비율 (낮을수록 긴급)
  ROUND(SAFE_DIVIDE(SUM(s.avaliableStock), SUM(p.quantity)), 2) AS stock_sales_ratio,
  COUNT(DISTINCT s.itemCode) AS option_count  -- 옵션 수
FROM
  `damoa-mart.biz_analytics.product_funnel_daily` p
LEFT JOIN
  `damoa-lake.logistics_owned.stockDetail_raw` s
ON
  p.mall_product_code = s.mallProductCode
WHERE
  p.dt BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND CURRENT_DATE()  -- 파티션 필터
  AND s.sales_status = 'ACTIVE'  -- 판매중 상품만
GROUP BY
  p.brand_name, p.mall_product_code, p.product_name
HAVING
  SUM(p.gmv) > 500000  -- 주간 매출 50만원 이상
  AND SUM(s.avaliableStock) < 30  -- 재고 30개 미만
  AND SAFE_DIVIDE(SUM(s.avaliableStock), SUM(p.quantity)) < 1.5  -- 재고가 판매량의 1.5배 미만
ORDER BY
  stock_sales_ratio ASC,  -- 재고 부족한 순서
  weekly_gmv DESC  -- 매출 높은 순서
```

### 적중상품 분석 (상위 0.5% GMV)
```sql
-- 브랜드별 적중상품 조회 (GMV 기준 상위 0.5%)
WITH product_gmv AS (
  -- 1단계: 상품별 총 GMV 계산
  SELECT
    brand_name,
    mall_product_code,
    product_name,
    SUM(gmv) AS total_gmv,
    SUM(vcnt) AS total_views,
    SUM(scnt) AS total_clicks,
    SUM(buy_cnt) AS total_buys,
    SUM(quantity) AS total_quantity,
    ROUND(SAFE_DIVIDE(SUM(scnt), SUM(vcnt)) * 100, 2) AS ctr,
    ROUND(SAFE_DIVIDE(SUM(buy_cnt), SUM(scnt)) * 100, 2) AS cvr,
    ROUND(SAFE_DIVIDE(SUM(gmv), SUM(vcnt)), 0) AS spv
  FROM
    `damoa-mart.biz_analytics.product_funnel_daily`
  WHERE
    dt BETWEEN '2025-12-01' AND '2025-12-10'  -- 파티션 필터
  GROUP BY
    brand_name, mall_product_code, product_name
),
ranked_products AS (
  -- 2단계: GMV 기준 백분위 계산
  SELECT
    *,
    PERCENT_RANK() OVER (ORDER BY total_gmv DESC) AS gmv_percentile,
    ROW_NUMBER() OVER (ORDER BY total_gmv DESC) AS gmv_rank
  FROM
    product_gmv
)
-- 3단계: 적중상품 필터링 (상위 0.5%)
SELECT
  brand_name,
  mall_product_code,
  product_name,
  gmv_rank,
  total_gmv,
  total_quantity,
  total_views,
  ctr,
  cvr,
  spv,
  ROUND(gmv_percentile * 100, 2) AS gmv_percentile_pct  -- 백분위 (%)
FROM
  ranked_products
WHERE
  gmv_percentile <= 0.005  -- 상위 0.5% = 적중상품
ORDER BY
  total_gmv DESC
```

### 브랜드별 적중상품 개수 집계
```sql
-- 브랜드별 적중상품 달성 현황 (최근 7일)
WITH product_gmv AS (
  SELECT
    brand_name,
    mall_product_code,
    SUM(gmv) AS total_gmv
  FROM
    `damoa-mart.biz_analytics.product_funnel_daily`
  WHERE
    dt BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND CURRENT_DATE()
  GROUP BY
    brand_name, mall_product_code
),
ranked_products AS (
  SELECT
    *,
    PERCENT_RANK() OVER (ORDER BY total_gmv DESC) AS gmv_percentile
  FROM
    product_gmv
)
SELECT
  brand_name,
  COUNT(*) AS total_products,  -- 총 상품 수
  COUNT(CASE WHEN gmv_percentile <= 0.005 THEN 1 END) AS hit_products,  -- 적중상품 수
  ROUND(SAFE_DIVIDE(
    COUNT(CASE WHEN gmv_percentile <= 0.005 THEN 1 END),
    COUNT(*)
  ) * 100, 2) AS hit_product_rate,  -- 적중상품 비율 (%)
  SUM(CASE WHEN gmv_percentile <= 0.005 THEN total_gmv ELSE 0 END) AS hit_product_gmv,  -- 적중상품 총 매출
  SUM(total_gmv) AS total_gmv  -- 전체 매출
FROM
  ranked_products
GROUP BY
  brand_name
ORDER BY
  hit_products DESC
```

## 데이터 분석 워크플로우

### 1. 데이터 탐색
- BigQuery에서 테이블 구조 확인
- 날짜 범위 및 브랜드 데이터 유무 확인
- 데이터 품질 체크 (NULL, 이상치 등)

### 2. 분석 쿼리 작성
- 분석 목적에 맞는 SQL 작성
- 필수 규칙 준수 (한글 주석, dt 파티션 필터 등)
- 쿼리 검증 (dry_run 옵션 활용)

### 3. 결과 해석 및 시각화
- 쿼리 결과를 마크다운 테이블로 정리
- 주요 인사이트 도출
- 필요시 그래프/차트 생성

### 4. 리포트 작성
- 분석 결과 요약
- 액션 아이템 도출
- 다음 분석 방향 제시

## 주의사항

### 쿼리 최적화
- **파티션 필터 필수**: `dt` 필드에 항상 필터 조건 추가 (비용 절감)
- **날짜 범위 제한**: 필요한 기간만 조회
- **집계 함수 활용**: 원본 데이터보다 집계된 결과 선호

### 데이터 해석
- **NULL 처리**: 0으로 나누기 방지 위해 `SAFE_DIVIDE` 사용 (NULLIF 대신)
- **브랜드명 정확도**: 띄어쓰기, 대소문자 정확히 입력
- **날짜 기준**: 파티션 날짜(dt) 기준으로 분석
- **업계 평균 참고**: CTR 2-4%, CVR 1-3%

### 보안
- 민감한 데이터는 외부 공유 금지
- BigQuery 접근 권한 관리 철저
- 개인정보 포함 여부 확인

## 기술 스택

- **데이터 웨어하우스**: Google BigQuery
- **쿼리 언어**: SQL (BigQuery Standard SQL)
- **데이터 분석**: Python (pandas, numpy) - 필요시
- **시각화**: matplotlib, seaborn, plotly - 필요시
- **문서화**: Markdown

## 실습 환경

> **중요**: 기존 업무 채널/문서에 영향을 주지 않도록, 아래 지정된 환경에서만 실습합니다.

| 구분 | 실습용 리소스 | 설명 |
| --- | --- | --- |
| **Notion 데이터베이스** | `2c9466b6209980aaada8cffdefa18471` | Week 2 실습용 데이터베이스 |
| **Slack 채널** | `C0A3GLY3K34` | #biz-pb-alert-test (테스트 전용 채널) |

### 실습 환경 사용 규칙

1. **Notion 페이지 생성/수정**: 반드시 `2c9466b6209980aaada8cffdefa18471` 데이터베이스에만 작성
2. **Slack 메시지 전송**: 반드시 `C0A3GLY3K34` (#biz-pb-alert-test) 채널에만 전송
3. **운영 환경 보호**: 실제 업무 채널(#biz-pb1, #biz-pb2 등)이나 운영 Notion 페이지에는 절대 쓰기 금지

## 추가 리소스

- [BigQuery 문서](https://cloud.google.com/bigquery/docs)
- [BigQuery Standard SQL 함수](https://cloud.google.com/bigquery/docs/reference/standard-sql/functions-and-operators)
- [데이터 시각화 Best Practices](https://www.storytellingwithdata.com/)

---

## Claude Code 커맨드

### 적중상품 주간 분석

PB1팀 브랜드의 적중상품을 주간 추적하고 리포트를 자동 생성합니다.

**사용법**:
```bash
# 전체 브랜드, 전체 시즌
/weekly-hit-product-analysis

# 특정 브랜드만
/weekly-hit-product-analysis 마치마라

# 브랜드 + 시즌 필터
/weekly-hit-product-analysis 마치마라,지재 2026SS
```

**상세 문서**: [.claude/commands/weekly-hit-product-analysis.md](.claude/commands/weekly-hit-product-analysis.md)
