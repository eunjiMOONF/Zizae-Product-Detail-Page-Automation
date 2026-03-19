# -*- coding: utf-8 -*-
"""
지재 상세페이지 자동 생성 웹앱
- 스프레드시트에서 상품 데이터 로드
- 이미지 드래그&드롭
- JPG Export
"""

import os
import json
import subprocess
import uuid
import urllib.request
import urllib.parse
from io import BytesIO
from flask import Flask, render_template, request, jsonify, send_file
from PIL import Image, ImageDraw, ImageFont

import mimetypes
mimetypes.add_type('font/ttf', '.ttf')
mimetypes.add_type('font/otf', '.otf')

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'uploads')
app.config['EXPORT_FOLDER'] = os.path.join(os.path.dirname(__file__), 'exports')
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['EXPORT_FOLDER'], exist_ok=True)

# 상품 데이터 캐시
products_cache = {}


def get_gcloud_token():
    """gcloud 인증 토큰 발급"""
    result = subprocess.run(
        ['gcloud.cmd', 'auth', 'print-access-token'],
        capture_output=True, text=True, timeout=30
    )
    return result.stdout.strip()


def detect_sheet_format(spreadsheet_id, token):
    """스프레드시트의 시트 목록을 확인하여 양식 자동 감지"""
    url = (
        f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}"
        f"?fields=sheets.properties"
    )
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {token}")
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read().decode("utf-8"))

    sheet_names = [s["properties"]["title"] for s in data.get("sheets", [])]

    if "피그마싱크(완전자동화)" in sheet_names:
        return "figma_sync"
    elif "Products" in sheet_names:
        return "products_v2"
    else:
        # 첫 번째 시트 사용
        return "unknown", sheet_names[0] if sheet_names else ""


def load_sheet_data(spreadsheet_id):
    """구글 스프레드시트에서 전체 데이터 로드 (양식 자동 감지)"""
    token = get_gcloud_token()
    fmt = detect_sheet_format(spreadsheet_id, token)

    if fmt == "figma_sync":
        return _load_figma_sync(spreadsheet_id, token)
    elif fmt == "products_v2":
        return _load_products_v2(spreadsheet_id, token)
    else:
        # unknown - 첫 시트 헤더 확인 후 시도
        return _load_products_v2(spreadsheet_id, token)


def _read_sheet(spreadsheet_id, token, sheet_name, range_str="A1:EZ200"):
    """시트 데이터 읽기 공통 함수"""
    encoded = urllib.parse.quote(f"{sheet_name}!{range_str}")
    url = (
        f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}"
        f"/values/{encoded}"
    )
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {token}")
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read().decode("utf-8"))
    return data.get("values", [])


def _load_figma_sync(spreadsheet_id, token):
    """기존 양식: 피그마싱크(완전자동화) 탭"""
    rows = _read_sheet(spreadsheet_id, token, "피그마싱크(완전자동화)")

    if len(rows) < 2:
        return []

    def g(row, idx):
        return row[idx] if idx < len(row) else ""

    products = []
    for row in rows[1:]:
        if len(row) < 5 or not row[0]:
            continue

        code = row[0]

        # 컬러 (17~26)
        colors = []
        for ci in range(0, 5):
            ko = g(row, 17 + ci * 2)
            en = g(row, 18 + ci * 2)
            if ko:
                colors.append({"ko": ko, "en": en})

        # 디테일 포인트 (5~15)
        details = [g(row, i) for i in range(5, 16) if g(row, i)]

        # 패브릭
        fabric1 = g(row, 27)
        fabric2 = g(row, 28)
        fabric_desc = g(row, 29)

        # 사이즈 호칭 (35~40)
        measurements_top = ["어깨너비", "가슴둘레", "허리둘레", "엉덩이둘레",
                            "허벅지둘레", "밑단둘레", "밑위길이", "소매길이(화장)",
                            "소매통", "총장"]

        sizes = []
        size_data = {}
        for si in range(6):
            label = g(row, 35 + si)
            base = 41 + si * 10
            vals = [g(row, base + mi) for mi in range(10)]
            if label:
                sizes.append(label)
                size_data[f"size_{len(sizes)-1}"] = vals
        if not sizes:
            sizes = ["FREE"]

        # Product Guide (101~108)
        product_info = {
            "name": g(row, 101), "color": g(row, 102),
            "size": g(row, 103), "composition": g(row, 104),
            "origin": g(row, 105), "wash": g(row, 106),
            "material1": g(row, 107), "material2": g(row, 108),
        }

        # Check Point (109~113)
        checkpoint = {
            "lining": g(row, 109), "seethrough": g(row, 110),
            "stretch": g(row, 111), "thickness": g(row, 112),
            "season": g(row, 113),
        }

        product = {
            "code": code, "season": g(row, 1),
            "name": g(row, 2), "main_name": g(row, 3),
            "description": g(row, 4), "size_recommend": g(row, 16),
            "details": details, "colors": colors,
            "fabric1": fabric1, "fabric2": fabric2,
            "fabric_desc": fabric_desc, "sizes": sizes,
            "size_data": size_data, "measurements": measurements_top,
            "product_info": product_info, "checkpoint": checkpoint,
            "model_info": {},
        }
        products.append(product)

    return products


def _load_products_v2(spreadsheet_id, token):
    """새 양식: Products 탭"""
    rows = _read_sheet(spreadsheet_id, token, "Products")

    if len(rows) < 3:
        return []

    # 헤더(0행), 타입(1행), 데이터(2행~)
    headers = rows[0] if rows else []

    def g(row, idx):
        return row[idx] if idx < len(row) else ""

    # 헤더 인덱스 매핑 (컬럼명으로 찾기)
    col = {}
    for i, h in enumerate(headers):
        col[h] = i

    products = []
    for row in rows[2:]:  # 0=헤더, 1=타입설명, 2~=데이터
        code = g(row, col.get("상품코드", 1))
        if not code:
            continue

        # 컬러 (컬러명_1 ~ 컬러명_10, 셀에 "English\n한글" 형태)
        colors = []
        for ci in range(1, 11):
            key = f"컬러명_{ci}"
            if key in col:
                raw = g(row, col[key])
                if raw:
                    parts = raw.strip().split("\n")
                    en = parts[0].strip()
                    ko = parts[1].strip() if len(parts) >= 2 else en
                    colors.append({"ko": ko, "en": en})

        # 디테일 포인트 (hero_bullet1~5)
        details = []
        for di in range(1, 6):
            key = f"hero_bullet{di}"
            if key in col:
                val = g(row, col[key])
                if val:
                    details.append(val)

        # 패브릭
        fabric1 = g(row, col.get("fabric_소재명", 999))
        fabric_desc = g(row, col.get("fabric_설명", 999))

        # 모델 정보
        model_info = {
            "name": g(row, col.get("model_이름", 999)),
            "height": g(row, col.get("model_키", 999)),
            "weight": g(row, col.get("model_몸무게", 999)),
            "top": g(row, col.get("model_상의", 999)),
            "bottom": g(row, col.get("model_하의", 999)),
            "shoes": g(row, col.get("model_신발", 999)),
        }

        # Product Guide
        product_info = {
            "name": g(row, col.get("info_상품명", 999)),
            "color": g(row, col.get("info_색상", 999)),
            "size": g(row, col.get("info_사이즈", 999)),
            "composition": g(row, col.get("info_구성", 999)),
            "origin": g(row, col.get("info_생산지", 999)),
            "wash": g(row, col.get("info_세탁법", 999)),
            "material1": g(row, col.get("info_혼용율", 999)),
            "material2": "",
        }

        # Check Point
        checkpoint = {
            "lining": g(row, col.get("안감", 999)),
            "seethrough": g(row, col.get("비침", 999)),
            "stretch": g(row, col.get("신축성", 999)),
            "thickness": g(row, col.get("두께감", 999)),
            "season": g(row, col.get("계절감", 999)),
        }

        # Disclaimer
        disclaimer = g(row, col.get("disclaimer_텍스트", 999))

        # 상의 사이즈 (상의_사이즈_1 ~ 상의_사이즈_6)
        measurements_top = ["어깨너비", "가슴둘레", "소매길이(화장)", "소매통",
                            "허리둘레", "엉덩이둘레", "밑단둘레", "총장"]
        sizes = []
        size_data = {}
        for si in range(1, 7):
            sz_key = f"상의_사이즈_{si}"
            if sz_key in col:
                label = g(row, col[sz_key])
                if label:
                    sizes.append(label)
                    vals = []
                    for m in measurements_top:
                        mk = f"상의_{m}_{si}"
                        vals.append(g(row, col.get(mk, 999)))
                    size_data[f"size_{len(sizes)-1}"] = vals

        # 하의 사이즈 (상의가 없는 경우)
        measurements_bottom = ["허리둘레", "엉덩이둘레", "허벅지둘레",
                               "밑단둘레", "밑위길이", "총장"]
        has_bottom = False
        bottom_sizes = []
        bottom_size_data = {}
        for si in range(1, 7):
            sz_key = f"하의_사이즈_{si}"
            if sz_key in col:
                label = g(row, col[sz_key])
                if label:
                    has_bottom = True
                    bottom_sizes.append(label)
                    vals = []
                    for m in measurements_bottom:
                        mk = f"하의_{m}_{si}"
                        vals.append(g(row, col.get(mk, 999)))
                    bottom_size_data[f"size_{len(bottom_sizes)-1}"] = vals

        # 상의 사이즈가 없고 하의만 있으면 하의 사용
        if not sizes and has_bottom:
            sizes = bottom_sizes
            size_data = bottom_size_data
            measurements_top = measurements_bottom

        if not sizes:
            sizes = ["FREE"]

        # 도식화 복종으로 상/하의 구분
        clothing_type = g(row, col.get("도식화_복종", 999))

        # Size Badge (size_badge_label_1~6, size_badge_desc_1~6)
        size_badges = []
        for bi in range(1, 7):
            lbl_key = f"size_badge_label_{bi}"
            desc_key = f"size_badge_desc_{bi}"
            if lbl_key in col:
                lbl = g(row, col[lbl_key])
                desc = g(row, col.get(desc_key, 999))
                if lbl:
                    size_badges.append({"label": lbl, "desc": desc})

        product = {
            "code": code,
            "season": "",
            "name": g(row, col.get("상품명", 999)),
            "main_name": g(row, col.get("상품명", 999)),
            "description": "",  # v2에는 별도 설명 없음
            "size_recommend": "",
            "details": details,
            "colors": colors,
            "fabric1": fabric1,
            "fabric2": "",
            "fabric_desc": fabric_desc,
            "sizes": sizes,
            "size_data": size_data,
            "size_data_bottom": bottom_size_data if has_bottom and sizes != bottom_sizes else {},
            "bottom_sizes": bottom_sizes if has_bottom and sizes != bottom_sizes else [],
            "measurements": measurements_top,
            "measurements_bottom": measurements_bottom if has_bottom else [],
            "product_info": product_info,
            "checkpoint": checkpoint,
            "model_info": model_info,
            "clothing_type": clothing_type,
            "disclaimer": disclaimer,
            "size_badges": size_badges,
        }
        products.append(product)

    return products


def get_font(name, size, bold=False):
    """폰트 로드 (fallback 처리)"""
    font_candidates = {
        "header_en": ["Optima", "Georgia", "Times New Roman", "arial"],
        "body_ko": ["MaruBuriOTF-Bold" if bold else "MaruBuriOTF-Regular",
                     "MaruBuri-Bold" if bold else "MaruBuri-Regular",
                     "NanumMyeongjo", "malgun", "gulim"],
        "label_ko": ["AritaBuriKR-Medium", "MaruBuriOTF-Regular", "NanumMyeongjo", "malgun"],
    }

    candidates = font_candidates.get(name, ["arial"])
    for font_name in candidates:
        try:
            return ImageFont.truetype(font_name, size)
        except (OSError, IOError):
            # Windows 폰트 경로 시도
            for ext in [".ttf", ".otf", ".ttc"]:
                font_path = os.path.join("C:/Windows/Fonts", font_name + ext)
                try:
                    return ImageFont.truetype(font_path, size)
                except (OSError, IOError):
                    continue
    return ImageFont.load_default()


def generate_detail_page(product, image_slots, slot_configs):
    """상세페이지 이미지 생성"""
    WIDTH = 800
    PURPLE = (100, 47, 233)
    DARK_GRAY = (63, 63, 63)
    BLACK = (0, 0, 0)
    WHITE = (255, 255, 255)
    LIGHT_GRAY = (191, 191, 191)
    BG = (255, 255, 255)

    sections = []

    # === 섹션 1: 메인 이미지 + 컬러칩 ===
    section1_parts = []

    # 메인 이미지
    if "main" in image_slots and image_slots["main"]:
        img_path = os.path.join(app.config['UPLOAD_FOLDER'], image_slots["main"])
        if os.path.exists(img_path):
            main_img = Image.open(img_path).convert("RGB")
            config = slot_configs.get("main", {})
            zoom = config.get("zoom", 1.0)
            offset_x = config.get("offsetX", 0)
            offset_y = config.get("offsetY", 0)

            # 줌 적용
            new_w = int(main_img.width * zoom)
            new_h = int(main_img.height * zoom)
            main_img = main_img.resize((new_w, new_h), Image.LANCZOS)

            # 800px 너비에 맞춰 crop
            target_h = int(WIDTH * 1.25)  # 4:5 비율
            canvas = Image.new("RGB", (WIDTH, target_h), BG)

            # offset 적용하여 붙여넣기
            paste_x = int(-offset_x * zoom)
            paste_y = int(-offset_y * zoom)

            # 이미지를 800px 너비에 맞춰 스케일
            scale = WIDTH / main_img.width if zoom == 1.0 else 1.0
            if scale != 1.0 and zoom == 1.0:
                main_img = main_img.resize(
                    (WIDTH, int(main_img.height * scale)), Image.LANCZOS
                )
                paste_x = 0
                paste_y = 0

            canvas.paste(main_img, (paste_x, paste_y))
            section1_parts.append(canvas)

    # 컬러칩
    if product.get("colors"):
        colors = product["colors"]
        chip_h = 150
        chip_canvas = Image.new("RGB", (WIDTH, chip_h), BG)
        draw = ImageDraw.Draw(chip_canvas)
        font_en = get_font("header_en", 22, bold=True)
        font_ko = get_font("body_ko", 18)

        n = len(colors)
        chip_size = 70
        gap = 30
        total_w = n * chip_size + (n - 1) * gap
        start_x = (WIDTH - total_w) // 2

        for i, color in enumerate(colors):
            cx = start_x + i * (chip_size + gap) + chip_size // 2
            cy = 40 + chip_size // 2
            # 원 그리기 (회색 placeholder)
            draw.ellipse(
                [cx - chip_size // 2, cy - chip_size // 2,
                 cx + chip_size // 2, cy + chip_size // 2],
                fill=LIGHT_GRAY, outline=DARK_GRAY, width=1
            )
            # 컬러명
            en_text = color.get("en", "")
            ko_text = color.get("ko", "")
            if en_text:
                bbox = draw.textbbox((0, 0), en_text, font=font_en)
                tw = bbox[2] - bbox[0]
                draw.text((cx - tw // 2, cy + chip_size // 2 + 5),
                          en_text, fill=DARK_GRAY, font=font_en)
            if ko_text:
                bbox = draw.textbbox((0, 0), ko_text, font=font_ko)
                tw = bbox[2] - bbox[0]
                draw.text((cx - tw // 2, cy + chip_size // 2 + 28),
                          ko_text, fill=DARK_GRAY, font=font_ko)

        section1_parts.append(chip_canvas)

    if section1_parts:
        h = sum(p.height for p in section1_parts)
        s1 = Image.new("RGB", (WIDTH, h), BG)
        y = 0
        for p in section1_parts:
            s1.paste(p, (0, y))
            y += p.height
        sections.append(s1)

    # === 섹션 2: 제품컷 ===
    product_imgs = []
    for key in ["product_1", "product_2", "product_3"]:
        if key in image_slots and image_slots[key]:
            img_path = os.path.join(app.config['UPLOAD_FOLDER'], image_slots[key])
            if os.path.exists(img_path):
                product_imgs.append(Image.open(img_path).convert("RGB"))

    if product_imgs:
        # Colors 헤더
        header_h = 80
        header = Image.new("RGB", (WIDTH, header_h), BG)
        draw = ImageDraw.Draw(header)
        font = get_font("header_en", 45, bold=True)
        bbox = draw.textbbox((0, 0), "Colors", font=font)
        tw = bbox[2] - bbox[0]
        draw.text(((WIDTH - tw) // 2, 15), "Colors", fill=DARK_GRAY, font=font)
        sections.append(header)

        # 제품컷 이미지 나란히
        n = len(product_imgs)
        slot_w = WIDTH // n
        row_h = int(slot_w * 1.3)
        row = Image.new("RGB", (WIDTH, row_h), BG)
        for i, img in enumerate(product_imgs):
            img_resized = img.resize((slot_w, row_h), Image.LANCZOS)
            row.paste(img_resized, (i * slot_w, 0))
        sections.append(row)

    # === 섹션 3: MD COMMENTS + 상품설명 + 디테일 ===
    text_parts = []

    # MD COMMENTS 헤더
    h1 = Image.new("RGB", (WIDTH, 100), BG)
    draw = ImageDraw.Draw(h1)
    font = get_font("header_en", 45, bold=True)
    bbox = draw.textbbox((0, 0), "MD COMMENTS", font=font)
    tw = bbox[2] - bbox[0]
    draw.text(((WIDTH - tw) // 2, 30), "MD COMMENTS", fill=BLACK, font=font)
    text_parts.append(h1)

    # 메인 상품명
    if product.get("main_name"):
        font_title = get_font("body_ko", 32, bold=True)
        h2 = Image.new("RGB", (WIDTH, 60), BG)
        draw = ImageDraw.Draw(h2)
        bbox = draw.textbbox((0, 0), product["main_name"], font=font_title)
        tw = bbox[2] - bbox[0]
        draw.text(((WIDTH - tw) // 2, 10), product["main_name"],
                  fill=BLACK, font=font_title)
        text_parts.append(h2)

    # 상품설명
    if product.get("description"):
        font_desc = get_font("body_ko", 26)
        lines = product["description"].split("\n")
        line_h = 38
        desc_h = len(lines) * line_h + 40
        h3 = Image.new("RGB", (WIDTH, desc_h), BG)
        draw = ImageDraw.Draw(h3)
        y = 20
        for line in lines:
            if line.strip():
                bbox = draw.textbbox((0, 0), line.strip(), font=font_desc)
                tw = bbox[2] - bbox[0]
                draw.text(((WIDTH - tw) // 2, y), line.strip(),
                          fill=BLACK, font=font_desc)
            y += line_h
        text_parts.append(h3)

    if text_parts:
        h = sum(p.height for p in text_parts)
        combined = Image.new("RGB", (WIDTH, h), BG)
        y = 0
        for p in text_parts:
            combined.paste(p, (0, y))
            y += p.height
        sections.append(combined)

    # 디테일 포인트 + 디테일 이미지
    for i, detail_text in enumerate(product.get("details", [])[:6]):
        # 번호 배지 + 텍스트
        badge_h = 60
        badge_canvas = Image.new("RGB", (WIDTH, badge_h), BG)
        draw = ImageDraw.Draw(badge_canvas)

        # 보라색 배지
        badge_x, badge_y = 50, 8
        badge_size = 45
        draw.rectangle(
            [badge_x, badge_y, badge_x + badge_size, badge_y + badge_size],
            fill=PURPLE
        )
        font_num = get_font("header_en", 22, bold=True)
        num_text = f"{i + 1:02d}"
        bbox = draw.textbbox((0, 0), num_text, font=font_num)
        nw = bbox[2] - bbox[0]
        nh = bbox[3] - bbox[1]
        draw.text(
            (badge_x + (badge_size - nw) // 2, badge_y + (badge_size - nh) // 2 - 2),
            num_text, fill=WHITE, font=font_num
        )

        # 텍스트
        font_detail = get_font("body_ko", 26, bold=True)
        draw.text((badge_x + badge_size + 15, 15), detail_text,
                  fill=BLACK, font=font_detail)
        sections.append(badge_canvas)

        # 디테일 이미지
        detail_key = f"detail_{i + 1}"
        if detail_key in image_slots and image_slots[detail_key]:
            img_path = os.path.join(
                app.config['UPLOAD_FOLDER'], image_slots[detail_key]
            )
            if os.path.exists(img_path):
                dimg = Image.open(img_path).convert("RGB")
                config = slot_configs.get(detail_key, {})
                zoom = config.get("zoom", 1.0)

                # 800px 너비에 맞춰 리사이즈
                scale = WIDTH / dimg.width
                dimg = dimg.resize(
                    (WIDTH, int(dimg.height * scale)), Image.LANCZOS
                )
                sections.append(dimg)

    # === 섹션 4: 착장컷 ===
    styling_imgs = []
    for key in ["styling_1", "styling_2", "styling_3",
                "styling_4", "styling_5", "styling_6"]:
        if key in image_slots and image_slots[key]:
            img_path = os.path.join(app.config['UPLOAD_FOLDER'], image_slots[key])
            if os.path.exists(img_path):
                styling_imgs.append(Image.open(img_path).convert("RGB"))

    if styling_imgs:
        # 2열 그리드
        col_w = WIDTH // 2
        row_h = int(col_w * 1.5)
        for i in range(0, len(styling_imgs), 2):
            row = Image.new("RGB", (WIDTH, row_h), BG)
            img1 = styling_imgs[i].resize((col_w, row_h), Image.LANCZOS)
            row.paste(img1, (0, 0))
            if i + 1 < len(styling_imgs):
                img2 = styling_imgs[i + 1].resize((col_w, row_h), Image.LANCZOS)
                row.paste(img2, (col_w, 0))
            sections.append(row)

    # === 섹션 5: 하단 고정 문구 ===
    disclaimer = (
        "모니터의 해상도에 따라 상품의 색상이 실물과 상이할 수 있습니다.\n"
        "색상칩은 동일한 디자인에 속한 색상군에 대한 참고자료이며, "
        "실제 상품의 색상과 상이할 수 있습니다.\n"
        "상품의 실측정보는 상품을 측정하는 위치와 방법, 각도에 따라 "
        "1-3cm의 오차가 있을 수 있습니다.\n"
        "오프라인과 동시 판매중인 상품으로 상품을 준비하는 과정에서 "
        "품절이 발생할 수 있습니다."
    )
    font_disc = get_font("body_ko", 20)
    lines = disclaimer.split("\n")
    disc_h = len(lines) * 30 + 60
    disc_canvas = Image.new("RGB", (WIDTH, disc_h), BG)
    draw = ImageDraw.Draw(disc_canvas)
    y = 30
    for line in lines:
        draw.text((30, y), line, fill=LIGHT_GRAY, font=font_disc)
        y += 30
    sections.append(disc_canvas)

    # === 전체 합치기 ===
    total_h = sum(s.height for s in sections)
    final = Image.new("RGB", (WIDTH, total_h), BG)
    y = 0
    for s in sections:
        final.paste(s, (0, y))
        y += s.height

    return final


# ===== Routes =====

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/load-sheet", methods=["POST"])
def api_load_sheet():
    """스프레드시트 로드"""
    global products_cache
    data = request.json
    sheet_id = data.get("sheet_id", "")

    # URL에서 ID 추출
    if "spreadsheets/d/" in sheet_id:
        sheet_id = sheet_id.split("spreadsheets/d/")[1].split("/")[0]

    try:
        products = load_sheet_data(sheet_id)
        products_cache = {p["code"]: p for p in products}
        return jsonify({
            "success": True,
            "products": [
                {"code": p["code"], "name": p["main_name"], "season": p["season"]}
                for p in products
            ]
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


@app.route("/api/product/<code>")
def api_product(code):
    """개별 상품 데이터 반환"""
    if code in products_cache:
        return jsonify({"success": True, "product": products_cache[code]})
    return jsonify({"success": False, "error": "상품을 찾을 수 없습니다"})


@app.route("/api/upload-image", methods=["POST"])
def api_upload_image():
    """이미지 업로드"""
    if "file" not in request.files:
        return jsonify({"success": False, "error": "파일 없음"})

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"success": False, "error": "파일명 없음"})

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        return jsonify({"success": False, "error": "지원하지 않는 형식"})

    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    return jsonify({"success": True, "filename": filename,
                    "url": f"/uploads/{filename}"})


@app.route("/uploads/<filename>")
def uploaded_file(filename):
    return send_file(os.path.join(app.config['UPLOAD_FOLDER'], filename))


@app.route("/api/auto-load-images", methods=["POST"])
def api_auto_load_images():
    """NAS 폴더에서 품번별 이미지 자동 로드 및 슬롯 배치"""
    data = request.json
    base_path = data.get("base_path", "")
    code = data.get("code", "")

    if not base_path or not code:
        return jsonify({"success": False, "error": "경로와 품번을 입력해주세요"})

    # 품번 폴더 경로 (Windows 역슬래시 → 슬래시 변환)
    base_path = base_path.replace("\\", "/")
    folder = os.path.join(base_path, code).replace("\\", "/")
    if not os.path.exists(folder):
        return jsonify({"success": False, "error": f"폴더를 찾을 수 없습니다: {folder}"})

    # 이미지 파일 목록
    files = [f for f in os.listdir(folder)
             if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))
             and not f.startswith('Thumbs')]

    # 파일 분류
    main_files = []      # ★ 메인컷
    detail_files = []    # 디테일N
    product_files = []   # _제품 (흰배경 행거컷)
    ghost_files = []     # 고스트컷 (제외)
    fabric_files = []    # 소재 이미지
    styling_files = []   # 나머지 = 착장컷 (모델컷)

    for f in sorted(files):
        fname_lower = f.lower()
        if f.startswith('\u2605') or f.startswith('*'):
            main_files.append(f)
        elif f.startswith('\uace0\uc2a4\ud2b8') or 'ghost' in fname_lower:
            ghost_files.append(f)  # 고스트컷 제외
        elif f.startswith('\uc18c\uc7ac') or f.startswith('소재') or f.startswith('소재컷') or 'fabric' in fname_lower:
            fabric_files.append(f)  # 소재 이미지
        elif f.startswith('\ub514\ud14c\uc77c') or f.startswith('detail'):
            detail_files.append(f)
        elif '_\uc81c\ud488' in f or '_product' in fname_lower or f.startswith('\uc81c\ud488\ucef7') or f.startswith('제품컷'):
            product_files.append(f)
        else:
            styling_files.append(f)

    # 디테일 파일 숫자순 정렬
    import re
    def extract_num(fname):
        nums = re.findall(r'\d+', fname)
        return int(nums[0]) if nums else 0
    detail_files.sort(key=extract_num)

    # 각 파일을 uploads 폴더로 복사하고 슬롯 매핑
    import shutil
    slots = {}

    def copy_to_uploads(src_filename):
        src = os.path.join(folder, src_filename)
        ext = os.path.splitext(src_filename)[1].lower()
        dest_name = f"{uuid.uuid4().hex}{ext}"
        dest = os.path.join(app.config['UPLOAD_FOLDER'], dest_name)
        shutil.copy2(src, dest)
        return dest_name

    # 메인 이미지
    if main_files:
        slots["main"] = copy_to_uploads(main_files[0])

    # 제품컷 (행거컷, _제품 파일만)
    for i, f in enumerate(product_files[:10]):
        slots[f"product_{i+1}"] = copy_to_uploads(f)

    # 소재 이미지
    if fabric_files:
        slots["fabric"] = copy_to_uploads(fabric_files[0])

    # 디테일컷 (전부)
    for i, f in enumerate(detail_files[:10]):
        slots[f"detail_{i+1}"] = copy_to_uploads(f)

    # 착장컷 (나머지 모델컷 전부, 고스트/소재 제외됨)
    for i, f in enumerate(styling_files):
        slots[f"styling_{i+1}"] = copy_to_uploads(f)

    # URL 매핑도 함께 반환
    urls = {k: f"/uploads/{v}" for k, v in slots.items()}

    return jsonify({
        "success": True,
        "slots": slots,
        "urls": urls,
        "summary": {
            "main": len(main_files),
            "product": len(product_files),
            "detail": len(detail_files),
            "styling": len(styling_files),
            "fabric": len(fabric_files),
            "ghost": len(ghost_files),
            "total": len(files)
        }
    })


@app.route("/api/extract-color", methods=["POST"])
def api_extract_color():
    """제품컷 이미지 중심부에서 대표 색상 추출"""
    data = request.json
    filename = data.get("filename", "")

    if not filename:
        return jsonify({"success": False, "error": "파일명 없음"})

    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if not os.path.exists(filepath):
        return jsonify({"success": False, "error": "파일 없음"})

    try:
        img = Image.open(filepath).convert("RGB")
        w, h = img.size
        # 중심 20% 영역에서 샘플링
        cx, cy = w // 2, h // 2
        region_size = min(w, h) // 5
        box = (cx - region_size, cy - region_size, cx + region_size, cy + region_size)
        region = img.crop(box)

        # 평균 색상 계산
        pixels = list(region.getdata())
        r = sum(p[0] for p in pixels) // len(pixels)
        g = sum(p[1] for p in pixels) // len(pixels)
        b = sum(p[2] for p in pixels) // len(pixels)

        return jsonify({
            "success": True,
            "color": {"r": r, "g": g, "b": b},
            "hex": f"#{r:02x}{g:02x}{b:02x}"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


@app.route("/api/auto-load-all", methods=["POST"])
def api_auto_load_all():
    """모든 품번에 대해 이미지 자동 로드"""
    data = request.json
    base_path = data.get("base_path", "")

    if not base_path:
        return jsonify({"success": False, "error": "경로를 입력해주세요"})

    results = {}
    for code in products_cache.keys():
        folder = os.path.join(base_path, code)
        if os.path.exists(folder):
            # 개별 로드 호출
            files = [f for f in os.listdir(folder)
                     if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))
                     and not f.startswith('Thumbs')]
            results[code] = {"found": True, "count": len(files)}
        else:
            results[code] = {"found": False, "count": 0}

    return jsonify({"success": True, "results": results})


@app.route("/api/save-export", methods=["POST"])
def api_save_export():
    """html2canvas로 캡처된 이미지를 서버에 저장"""
    if "file" not in request.files:
        return jsonify({"success": False, "error": "파일 없음"})

    file = request.files["file"]
    code = request.form.get("code", "unknown")
    filename = f"{code}_detail.jpg"
    filepath = os.path.join(app.config['EXPORT_FOLDER'], filename)
    file.save(filepath)

    return jsonify({"success": True, "filename": filename})


@app.route("/api/save-all-to-folder", methods=["POST"])
def api_save_all_to_folder():
    """상세페이지 + 썸네일을 이미지폴더/상세페이지/품번 구조로 저장"""
    code = request.form.get("code", "unknown")
    base_path = request.form.get("base_path", "")
    files = request.files.getlist("files")

    if not files:
        return jsonify({"success": False, "error": "파일 없음"})

    # 이미지 경로가 있으면 그 안에 상세페이지/품번 폴더 생성
    if base_path and os.path.exists(base_path):
        folder = os.path.join(base_path, "상세페이지", code)
    else:
        folder = os.path.join(app.config['EXPORT_FOLDER'], code)
    os.makedirs(folder, exist_ok=True)

    saved = []
    for f in files:
        filepath = os.path.join(folder, f.filename)
        f.save(filepath)
        saved.append(f.filename)

    return jsonify({
        "success": True,
        "folder": folder,
        "saved": saved,
        "count": len(saved)
    })


@app.route("/api/open-folder", methods=["POST"])
def api_open_folder():
    """폴더 열기 (Windows 탐색기)"""
    data = request.json
    folder = data.get("folder", "")
    if folder and os.path.exists(folder):
        os.startfile(folder)
        return jsonify({"success": True})
    return jsonify({"success": False, "error": "폴더 없음"})


@app.route("/api/save-thumbnails", methods=["POST"])
def api_save_thumbnails():
    """썸네일 이미지들을 zip으로 묶어서 반환"""
    import zipfile
    code = request.form.get("code", "unknown")
    files = request.files.getlist("files")

    if not files:
        return jsonify({"success": False, "error": "파일 없음"})

    zip_filename = f"{code}_thumbnails.zip"
    zip_path = os.path.join(app.config['EXPORT_FOLDER'], zip_filename)

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            zf.writestr(f.filename, f.read())

    return jsonify({
        "success": True,
        "filename": zip_filename,
        "url": f"/exports/{zip_filename}"
    })


@app.route("/api/export", methods=["POST"])
def api_export():
    """상세페이지 JPG Export"""
    data = request.json
    code = data.get("code")
    image_slots = data.get("image_slots", {})
    slot_configs = data.get("slot_configs", {})

    if code not in products_cache:
        return jsonify({"success": False, "error": "상품 데이터 없음"})

    product = products_cache[code]

    try:
        final_img = generate_detail_page(product, image_slots, slot_configs)
        filename = f"{code}_detail.jpg"
        filepath = os.path.join(app.config['EXPORT_FOLDER'], filename)
        final_img.save(filepath, "JPEG", quality=95)

        return jsonify({"success": True, "filename": filename,
                        "url": f"/exports/{filename}"})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)})


@app.route("/exports/<filename>")
def export_file(filename):
    return send_file(
        os.path.join(app.config['EXPORT_FOLDER'], filename),
        as_attachment=True
    )


if __name__ == "__main__":
    print("=" * 50)
    print("  지재 상세페이지 생성기")
    print("  http://localhost:5000")
    print("=" * 50)
    app.run(debug=True, host='0.0.0.0', port=5000)
