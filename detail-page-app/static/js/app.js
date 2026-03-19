// 지재 상세페이지 생성기 - Frontend

// === 상태 관리 ===
let products = [];
let currentProduct = null;
let imageSlots = {};      // { slotName: filename }
let slotConfigs = {};     // { slotName: { zoom, offsetX, offsetY } }
let allProductImages = {}; // { productCode: { imageSlots, slotConfigs } }

// === 임시저장 (localStorage) ===
function saveState() {
    if (!currentProduct) return;
    // 현재 품번 상태 저장
    allProductImages[currentProduct.code] = { imageSlots: {...imageSlots}, slotConfigs: {...slotConfigs} };
    // 썸네일 상태도 저장
    const thumbs = window.thumbStates || {};

    const data = {
        sheetId: document.getElementById('sheetId')?.value || '',
        imagePath: document.getElementById('imagePath')?.value || '',
        allProductImages,
        thumbStates: thumbs,
        lastProduct: currentProduct.code,
        savedAt: new Date().toISOString(),
    };
    localStorage.setItem('detailPageState', JSON.stringify(data));
    console.log('[임시저장] 완료:', currentProduct.code);
}

function loadState() {
    try {
        const raw = localStorage.getItem('detailPageState');
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) { return null; }
}

function clearState() {
    localStorage.removeItem('detailPageState');
    alert('임시저장 데이터가 삭제되었습니다.');
}

// 자동 임시저장 (30초마다)
setInterval(() => { if (currentProduct) saveState(); }, 30000);

// === 스프레드시트 로드 ===
async function loadSheet() {
    const btn = document.getElementById('loadSheetBtn');
    const input = document.getElementById('sheetId');
    const sheetId = input.value.trim();
    if (!sheetId) { alert('스프레드시트 ID를 입력해주세요'); return; }

    btn.disabled = true;
    btn.textContent = '로딩 중...';
    try {
        const resp = await fetch('/api/load-sheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sheet_id: sheetId })
        });
        const data = await resp.json();
        if (data.success) {
            products = data.products;
            renderProductList();
        } else { alert('로드 실패: ' + data.error); }
    } catch (e) { alert('오류: ' + e.message); }
    finally { btn.disabled = false; btn.textContent = '데이터 로드'; }
}

// === 상품 리스트 ===
function renderProductList() {
    const list = document.getElementById('productList');
    if (!products.length) { list.innerHTML = '<p class="empty-msg">상품이 없습니다</p>'; return; }
    list.innerHTML = products.map(p => `
        <div class="product-item" onclick="selectProduct('${p.code}')" id="item-${p.code}">
            <div class="code">${p.code}</div>
            <div class="name">${p.name || ''}</div>
            <div class="status" id="status-${p.code}">이미지 미설정</div>
        </div>
    `).join('');
}

// === 상품 선택 ===
async function selectProduct(code) {
    if (currentProduct) {
        allProductImages[currentProduct.code] = { imageSlots: { ...imageSlots }, slotConfigs: { ...slotConfigs } };
        saveState(); // 품번 전환 시 자동 임시저장
    }
    document.querySelectorAll('.product-item').forEach(el => el.classList.remove('active'));
    const item = document.getElementById('item-' + code);
    if (item) item.classList.add('active');

    try {
        const resp = await fetch(`/api/product/${code}`);
        const data = await resp.json();
        if (data.success) {
            currentProduct = data.product;
            document.getElementById('currentProduct').textContent = `${currentProduct.code} - ${currentProduct.main_name}`;
            if (allProductImages[code]) {
                imageSlots = { ...allProductImages[code].imageSlots };
                slotConfigs = { ...allProductImages[code].slotConfigs };
            } else {
                imageSlots = {};
                slotConfigs = {};
            }
            renderTemplate();
        }
    } catch (e) { alert('상품 로드 실패: ' + e.message); }
}

// === 템플릿 렌더링 ===
function renderTemplate() {
    const template = document.getElementById('template');
    document.getElementById('emptyState').style.display = 'none';
    template.style.display = 'block';

    const details = currentProduct.details || [];
    const colors = currentProduct.colors || [];

    // 디테일 포인트 (편집 가능)
    document.getElementById('detailPointsList').innerHTML = details.slice(0, 6).map((text, i) => `
        <div class="detail-point">
            <div class="detail-badge"><span>${String(i + 1).padStart(2, '0')}</span></div>
            <div class="detail-text editable" ondblclick="makeEditable(this)">${text}</div>
        </div>
    `).join('');

    // 컬러칩 (원형만, 텍스트 없음)
    document.getElementById('colorChips').innerHTML = colors.map((c, i) => `
        <div class="color-chip-circle" id="colorChip_${i}" title="${c.ko}"></div>
    `).join('');

    // 제품컷 2열 (컬러명 오버레이 + 순서 변경 화살표)
    const productWrap = document.getElementById('productCutsWrap');
    const colorCount = colors.length;
    const totalSlots = colorCount % 2 === 0 ? colorCount : colorCount + 1;
    let phtml = '';
    for (let i = 0; i < totalSlots; i += 2) {
        phtml += '<div class="product-cut-pair">';
        // 왼쪽
        if (i < colorCount) {
            phtml += `<div class="image-slot product-cut-item" data-slot="product_${i+1}"
                           ondrop="handleDrop(event)" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)">
                        <span class="slot-label">제품컷 ${i+1}</span>
                        <div class="product-color-overlay" onclick="event.stopPropagation()">
                            <input class="pco-en-input" value="${colors[i]?.en || ''}" placeholder="English" data-color-idx="${i}" data-lang="en" onchange="updateColorName(this)">
                            <input class="pco-ko-input" value="${colors[i]?.ko || ''}" placeholder="한글" data-color-idx="${i}" data-lang="ko" onchange="updateColorName(this)">
                        </div>
                      </div>`;
        }
        // 오른쪽
        if (i + 1 < colorCount) {
            phtml += `<div class="image-slot product-cut-item" data-slot="product_${i+2}"
                           ondrop="handleDrop(event)" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)">
                        <span class="slot-label">제품컷 ${i+2}</span>
                        <div class="product-color-overlay" onclick="event.stopPropagation()">
                            <input class="pco-en-input" value="${colors[i+1]?.en || ''}" placeholder="English" data-color-idx="${i+1}" data-lang="en" onchange="updateColorName(this)">
                            <input class="pco-ko-input" value="${colors[i+1]?.ko || ''}" placeholder="한글" data-color-idx="${i+1}" data-lang="ko" onchange="updateColorName(this)">
                        </div>
                      </div>`;
        } else if (colorCount % 2 === 1) {
            // 홀수: 로고 이미지 (피그마와 동일)
            phtml += `<div class="product-cut-item product-logo-placeholder">
                        <img src="/static/zizae_logo.png" class="logo-fill">
                      </div>`;
        }
        phtml += '</div>';
    }
    productWrap.innerHTML = phtml;

    // 착장컷 (동적 - 실제 이미지 수에 맞춤)
    renderStylingSlots();

    // 디테일 이미지 슬롯 (이미지 있는 수에 맞춤, 없으면 텍스트 수)
    let detailImageCount = 0;
    for (let i = 1; i <= 10; i++) {
        if (imageSlots[`detail_${i}`]) detailImageCount = i;
    }
    const detailSlotCount = detailImageCount > 0 ? detailImageCount : details.length;
    document.getElementById('detailImagesWrap').innerHTML = detailSlotCount > 0 ? Array.from({length: detailSlotCount}, (_, i) => `
        <div class="image-slot detail-image-item" data-slot="detail_${i+1}"
             ondrop="handleDrop(event)" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)">
            <span class="slot-label">디테일 ${i+1}${details[i] ? ': ' + details[i] : ''}</span></div>
    `).join('') : '';

    // 패브릭 자동 채우기
    const fm = document.getElementById('fabricMaterial');
    const fd = document.getElementById('fabricDesc');
    if (fm) fm.textContent = currentProduct.fabric1 || '폴리에스터100%';
    if (fd) fd.textContent = currentProduct.fabric_desc || '-';

    // Product Info 자동 채우기
    const pi = currentProduct.product_info || {};
    const setPI = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '-'; };
    setPI('piName', pi.name || currentProduct.main_name);
    setPI('piColors', pi.color || colors.map(c => c.ko).join('/'));
    setPI('piSize', pi.size || (currentProduct.sizes || ['FREE']).join('/'));
    setPI('piComposition', pi.composition);
    setPI('piOrigin', pi.origin || '중국');
    setPI('piWash', pi.wash || '드라이크리닝');
    setPI('piMaterial', (pi.material1 || '') + (pi.material2 ? '\n' + pi.material2 : ''));

    // 모델 정보 자동 채우기 (시트에 있으면, 없으면 기본값 유지)
    const mi = currentProduct.model_info || {};
    if (mi.name) { const el = document.getElementById('modelName'); if (el) el.textContent = mi.name; }
    if (mi.height) { const el = document.getElementById('modelHeight'); if (el) el.textContent = mi.height; }
    if (mi.weight) { const el = document.getElementById('modelWeight'); if (el) el.textContent = mi.weight; }
    if (mi.top) { const el = document.getElementById('modelTop'); if (el) el.textContent = mi.top; }
    if (mi.bottom) { const el = document.getElementById('modelBottom'); if (el) el.textContent = mi.bottom; }
    if (mi.shoes) { const el = document.getElementById('modelShoes'); if (el) el.textContent = mi.shoes; }

    // Check Point 자동 선택
    const cp = currentProduct.checkpoint || {};
    Object.entries(cp).forEach(([row, val]) => {
        if (val) {
            const el = document.querySelector(`.cp-opt[data-row="${row}"][data-val="${val}"]`);
            if (el) el.classList.add('active');
        }
    });

    renderSizeBadges();
    restoreImages();

    // 스와이프 초기화
    requestAnimationFrame(() => {
        setTimeout(() => {
            initDirectSwipe('.product-cut-item[data-slot]', false);
            // 착장컷 스와이프 제거 - 드래그로 이미지 위치 조정만
        }, 300);
    });
}

// === 착장컷 슬롯 렌더 (3장 1그룹, 간격 패턴: 100-20-120) ===
function renderStylingSlots() {
    const container = document.getElementById('stylingSlots');
    let stylingCount = 0;
    for (let i = 1; i <= 30; i++) {
        if (imageSlots[`styling_${i}`]) stylingCount = i;
    }
    // 이미지 있으면 그 수, 아니면 최소 9개(3그룹)
    const slotCount = Math.max(9, stylingCount);

    let html = '';
    for (let i = 1; i <= slotCount; i++) {
        // 그룹 내 위치 (1,2,3 반복)
        const posInGroup = ((i - 1) % 3) + 1;

        // 간격 결정
        let marginTop = '0';
        if (i > 1) {
            if (posInGroup === 1) {
                marginTop = '120px';  // 그룹 간
            } else if (posInGroup === 2) {
                marginTop = '100px';  // 그룹 내 1→2
            } else {
                marginTop = '20px';   // 그룹 내 2→3
            }
        }

        // 이미지 없으면 슬롯 숨김 (자동배치된 수 초과분)
        const hasImage = imageSlots[`styling_${i}`];
        const display = (i > stylingCount && stylingCount > 0) ? 'display:none;' : '';

        html += `<div class="image-slot styling-single" data-slot="styling_${i}"
                     ondrop="handleDrop(event)" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)"
                     style="margin-top:${marginTop};${display}">
                    <span class="slot-label">착장컷 ${i}</span>
                    <div class="styling-order-btns">
                        <span class="styling-num" onclick="event.stopPropagation(); moveStylingTo(${i})" title="클릭하여 이동할 번호 입력">${i}</span>
                    </div></div>`;
    }
    container.innerHTML = html;
}

// === 이미지 슬롯 복원 ===
function restoreImages() {
    document.querySelectorAll('.image-slot').forEach(slot => {
        const name = slot.dataset.slot;
        if (imageSlots[name]) {
            placeImage(slot, `/uploads/${imageSlots[name]}`);
        }
    });
}

// === 사이즈 배지 (시트의 size_badge_label/desc 사용, 없으면 sizes 폴백) ===
function renderSizeBadges() {
    const container = document.getElementById('sizeBadges');
    if (!container) return;

    const badges = currentProduct?.size_badges || [];
    const sizes = currentProduct?.sizes || ['FREE'];

    let badgesHtml = '';

    if (badges.length > 0) {
        // 시트에 size_badge 데이터가 있는 경우
        badgesHtml += '<div class="size-badges-row">';
        badgesHtml += badges.map(b => {
            // FREE는 1.5배(54px), 숫자(55,66등)는 2.5배(90px)
            const isNum = /^\d+$/.test(b.label.trim());
            const fontSize = isNum ? '54px' : '36px';
            return `
            <div class="size-badge-item">
                <div class="size-badge-circle">
                    <input class="size-badge-input" value="${b.label}"
                           style="background:transparent;border:none;color:#fff;font-size:${fontSize};font-weight:600;text-align:center;width:100px;">
                </div>
            </div>`;
        }).join('');
        badgesHtml += '</div>';
        // desc는 배지 아래 가운데 정렬로 (첫 번째 desc 사용, 동일하면 하나만)
        const uniqueDescs = [...new Set(badges.map(b => b.desc).filter(d => d))];
        if (uniqueDescs.length > 0) {
            badgesHtml += `<div class="size-badge-comment editable" ondblclick="makeEditable(this)">${uniqueDescs.join('<br>')}</div>`;
        }
    } else {
        // 폴백: sizes 배열로 배지 생성
        badgesHtml += '<div class="size-badges-row">';
        badgesHtml += sizes.map(s => `
            <div class="size-badge-item">
                <div class="size-badge-circle">
                    <input class="size-badge-input" value="${s}"
                           style="background:transparent;border:none;color:#fff;font-size:22px;font-weight:600;text-align:center;width:80px;">
                </div>
            </div>
        `).join('');
        badgesHtml += '</div>';
        badgesHtml += '<div class="size-badge-comment editable" ondblclick="makeEditable(this)">정사이즈로 착용 되는 제품입니다.</div>';
    }

    container.innerHTML = badgesHtml;

    renderSizeTable(sizes);
}

// === 사이즈 측정표 (스프레드시트 데이터 자동 채움) ===
function renderSizeTable(sizes) {
    const wrap = document.getElementById('sizeTableWrap');
    if (!wrap) return;

    // 서버에서 보내는 measurements 배열 사용 (양식에 따라 다름)
    const measureKeys = currentProduct?.measurements || ['어깨너비', '가슴둘레', '허리둘레', '엉덩이둘레', '허벅지둘레', '밑단둘레', '밑위길이', '소매길이(화장)', '소매통', '총장'];
    const sizeData = currentProduct?.size_data || {};

    // 값이 있는 행만 표시 (빈 행 제거)
    const activeRows = measureKeys.filter((m, mi) => {
        return sizes.some((s, si) => {
            const vals = sizeData[`size_${si}`] || [];
            return vals[mi] && vals[mi].trim() !== '';
        });
    });

    let html = '<table class="size-measure-table">';

    // 헤더행: 사이즈 숫자
    html += '<tr class="header-row"><td class="row-label"></td>';
    sizes.forEach(s => {
        html += `<td class="size-cell"><input value="${s}" readonly></td>`;
    });
    html += '</tr>';

    // 측정값 행 (데이터 있는 것만)
    activeRows.forEach(m => {
        const mi = measureKeys.indexOf(m);
        html += `<tr><td class="row-label">${m}</td>`;
        sizes.forEach((s, si) => {
            const vals = sizeData[`size_${si}`] || [];
            const val = vals[mi] || '';
            html += `<td class="size-cell"><input value="${val}" placeholder="-"></td>`;
        });
        html += '</tr>';
    });

    html += '</table>';
    html += '<div class="size-table-bottom"><span>측정 방법에 따라 1-3cm 정도 오차가 있을 수 있습니다.</span><span>(단위 cm)</span></div>';
    wrap.innerHTML = html;
}

// === Check Point 토글 ===
function toggleCP(el) {
    const row = el.dataset.row;
    document.querySelectorAll(`.cp-opt[data-row="${row}"]`).forEach(opt => opt.classList.remove('active'));
    el.classList.add('active');
}

// === 드래그 & 드롭 ===
function handleDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function handleDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }

async function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const slot = e.currentTarget;
    const files = e.dataTransfer.files;
    if (!files.length) return;

    if (files.length > 1) {
        await handleMultiDrop(files, slot.dataset.slot);
    } else {
        await uploadAndPlace(files[0], slot, slot.dataset.slot);
    }
}

async function handleMultiDrop(files, startSlotName) {
    const allSlots = document.querySelectorAll('.image-slot');
    let startFound = false;
    let fi = 0;
    for (const slot of allSlots) {
        if (slot.dataset.slot === startSlotName) startFound = true;
        if (!startFound || fi >= files.length) continue;
        if (!imageSlots[slot.dataset.slot]) {
            await uploadAndPlace(files[fi], slot, slot.dataset.slot);
            fi++;
        }
    }
}

async function uploadAndPlace(file, slot, slotName) {
    const formData = new FormData();
    formData.append('file', file);
    try {
        const resp = await fetch('/api/upload-image', { method: 'POST', body: formData });
        const data = await resp.json();
        if (data.success) {
            imageSlots[slotName] = data.filename;
            slotConfigs[slotName] = { zoom: 1.0, offsetX: 0, offsetY: 0 };
            placeImage(slot, data.url);
            updateStatus();
        }
    } catch (e) { console.error('업로드 실패:', e); }
}

// === 이미지 배치 + 슬롯 내 직접 확대/이동 ===
function placeImage(slot, url) {
    slot.classList.add('has-image');
    let img = slot.querySelector('img.slot-img');
    if (!img) {
        img = document.createElement('img');
        img.className = 'slot-img';
        img.draggable = false;
        // 오버레이(컬러명 등) 뒤에 넣기
        const overlay = slot.querySelector('.product-color-overlay');
        if (overlay) {
            slot.insertBefore(img, overlay);
        } else {
            slot.appendChild(img);
        }
    }
    img.src = url;

    // 오버레이(컬러명 input)에서 마우스 이벤트 차단
    const overlay = slot.querySelector('.product-color-overlay');
    if (overlay) {
        overlay.onmousedown = (e) => e.stopPropagation();
        overlay.onclick = (e) => e.stopPropagation();
    }

    const slotName = slot.dataset.slot;
    if (!slotConfigs[slotName]) slotConfigs[slotName] = { zoom: 1.0, offsetX: 0, offsetY: 0 };

    applyImageTransform(img, slotConfigs[slotName]);

    // 마우스 휠 = 확대/축소
    slot.onwheel = (e) => {
        e.preventDefault();
        const cfg = slotConfigs[slotName];
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        cfg.zoom = Math.max(1.0, Math.min(3.0, (cfg.zoom || 1.0) + delta));
        applyImageTransform(img, cfg);
    };

    // 마우스 드래그 = 이미지 위치 이동
    {
        let dragging = false, startX = 0, startY = 0, origOX = 0, origOY = 0;

        img.onmousedown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.closest('.product-color-overlay')) return;
            e.preventDefault();
            dragging = true;
            const cfg = slotConfigs[slotName];
            startX = e.clientX;
            startY = e.clientY;
            origOX = cfg.offsetX || 0;
            origOY = cfg.offsetY || 0;
        };

        const moveHandler = (e) => {
            if (!dragging) return;
            const cfg = slotConfigs[slotName];
            cfg.offsetX = origOX + (e.clientX - startX);
            cfg.offsetY = origOY + (e.clientY - startY);
            applyImageTransform(img, cfg);
        };
        const upHandler = () => { dragging = false; };

        slot._moveHandler && document.removeEventListener('mousemove', slot._moveHandler);
        slot._upHandler && document.removeEventListener('mouseup', slot._upHandler);
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
        slot._moveHandler = moveHandler;
        slot._upHandler = upHandler;
    }

    // 더블클릭 = 이미지 삭제 (슬롯에서 처리 - pointer-events:none 이미지도 대응)
    slot.ondblclick = (e) => {
        if (e.target.tagName === 'INPUT') return;
        if (!slot.classList.contains('has-image')) return;
        e.stopPropagation();
        if (confirm('이미지를 삭제하시겠습니까?')) {
            delete imageSlots[slotName];
            delete slotConfigs[slotName];
            slot.classList.remove('has-image');
            const slotImg = slot.querySelector('img.slot-img');
            if (slotImg) slotImg.remove();
            updateStatus();
        }
    };

    // 빈 슬롯 클릭 = 파일 선택
    slot.onclick = function(e) {
        if (e.target.tagName === 'INPUT') return; // input 클릭 무시
        if (slot.classList.contains('has-image')) return;
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
        input.onchange = async (ev) => {
            const files = ev.target.files;
            if (files.length === 1) await uploadAndPlace(files[0], slot, slot.dataset.slot);
            else if (files.length > 1) await handleMultiDrop(files, slot.dataset.slot);
        };
        input.click();
    };
}

function applyImageTransform(img, config) {
    const z = config.zoom || 1.0;
    const ox = config.offsetX || 0;
    const oy = config.offsetY || 0;
    // 고정 슬롯 크기 안에서 확대/이동
    img.style.width = `${z * 100}%`;
    img.style.height = `${z * 100}%`;
    img.style.objectFit = 'cover';
    img.style.left = `${ox}px`;
    img.style.top = `${oy}px`;
    img.style.position = 'absolute';
}

function updateStatus() {
    if (!currentProduct) return;
    const count = Object.keys(imageSlots).filter(k => imageSlots[k]).length;
    const el = document.getElementById('status-' + currentProduct.code);
    if (el) { el.textContent = `이미지 ${count}개 설정됨`; el.style.color = count > 0 ? '#6430e9' : '#666'; }
}

// === 이미지 자동 로드 (NAS) ===
async function autoLoadImages() {
    if (!currentProduct) { alert('상품을 먼저 선택해주세요'); return; }
    const basePath = document.getElementById('imagePath').value.trim();
    if (!basePath) { alert('이미지 폴더 경로를 입력해주세요'); return; }

    showLoading('이미지 자동 배치 중...');
    try {
        const resp = await fetch('/api/auto-load-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base_path: basePath, code: currentProduct.code })
        });
        const data = await resp.json();
        console.log('[auto-load] response:', JSON.stringify(data.success), JSON.stringify(data.summary || data.error));
        if (data.success) {
            imageSlots = { ...imageSlots, ...data.slots };
            for (const key of Object.keys(data.slots)) {
                if (!slotConfigs[key]) slotConfigs[key] = { zoom: 1.0, offsetX: 0, offsetY: 0 };
            }
            console.log('[auto-load] product slots:', Object.keys(data.slots).filter(k => k.startsWith('product_')));
            console.log('[auto-load] all slot keys:', Object.keys(data.slots));
            // 전체 템플릿 재렌더 (제품컷 슬롯 수가 바뀔 수 있으므로)
            renderTemplate();
            renderStylingSlots();
            restoreImages();
            updateStatus();
            extractColorChips();
            renderThumbnails();

            // 스와이프 재초기화
            setTimeout(() => {
                initDirectSwipe('.product-cut-item[data-slot]', false);
                // 착장컷 스와이프 제거 - 드래그로 이미지 위치 조정만
            }, 300);
            const s = data.summary;
            alert(`자동 배치 완료!\n메인: ${s.main}장 / 제품컷: ${s.product}장 / 디테일: ${s.detail}장 / 착장컷: ${s.styling}장`);
        } else { alert('실패: ' + data.error); }
    } catch (e) { alert('오류: ' + e.message); }
    finally { hideLoading(); }
}

async function autoLoadAll() {
    const basePath = document.getElementById('imagePath').value.trim();
    if (!basePath) { alert('이미지 폴더 경로를 입력해주세요'); return; }
    showLoading('전체 이미지 스캔 중...');

    for (const product of products) {
        try {
            const resp = await fetch('/api/auto-load-images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ base_path: basePath, code: product.code })
            });
            const data = await resp.json();
            if (data.success) {
                allProductImages[product.code] = {
                    imageSlots: data.slots,
                    slotConfigs: Object.fromEntries(Object.keys(data.slots).map(k => [k, { zoom: 1.0, offsetX: 0, offsetY: 0 }]))
                };
                const el = document.getElementById('status-' + product.code);
                if (el) { el.textContent = `이미지 ${Object.keys(data.slots).length}개`; el.style.color = '#6430e9'; }
            }
        } catch (e) { console.error(`${product.code} 로드 실패:`, e); }
    }

    hideLoading();
    if (currentProduct && allProductImages[currentProduct.code]) {
        imageSlots = { ...allProductImages[currentProduct.code].imageSlots };
        slotConfigs = { ...allProductImages[currentProduct.code].slotConfigs };
        renderStylingSlots();
        restoreImages();
        setTimeout(() => {
            initDirectSwipe('.product-cut-item[data-slot]', false);
            // 착장컷 스와이프 제거 - 드래그로 이미지 위치 조정만
        }, 300);
    }
    alert('전체 자동 배치 완료!');
}

// === 전체 저장 (상세페이지 + 썸네일 → 품번 폴더) ===
async function saveAllToFolder() {
    if (!currentProduct) { alert('상품을 먼저 선택해주세요'); return; }
    showLoading('전체 저장 중...');

    const allBlobs = [];

    // 1. 상세페이지 캡처
    try {
        const template = document.getElementById('template');
        // 빈 슬롯 + 순서 버튼 숨기기
        const emptySlots = template.querySelectorAll('.image-slot:not(.has-image)');
        emptySlots.forEach(el => { el.dataset.wasVisible = el.style.display; el.style.display = 'none'; });
        const orderBtns = template.querySelectorAll('.styling-order-btns');
        orderBtns.forEach(el => el.style.display = 'none');

        const wrapper = document.getElementById('templateWrapper');
        wrapper.scrollTop = 0;
        const canvas = await html2canvas(template, {
            scale: 2, useCORS: true, backgroundColor: '#ffffff',
            width: 800, height: template.scrollHeight,
            windowWidth: 800, windowHeight: template.scrollHeight,
            scrollY: 0, scrollX: 0,
        });
        emptySlots.forEach(el => { el.style.display = el.dataset.wasVisible || ''; });
        orderBtns.forEach(el => el.style.display = '');

        const detailBlob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95));
        allBlobs.push({ blob: detailBlob, name: `${currentProduct.code}_detail.jpg` });
    } catch (e) { console.error('상세페이지 캡처 실패:', e); }

    // 2. 썸네일 생성
    const stylingKeys = [];
    for (let i = 1; i <= 30; i++) {
        if (imageSlots[`styling_${i}`]) stylingKeys.push(`styling_${i}`);
    }

    for (let i = 0; i < stylingKeys.length; i++) {
        const key = stylingKeys[i];
        const url = `/uploads/${imageSlots[key]}`;
        const blob = await new Promise((resolve) => {
            const c = document.createElement('canvas');
            c.width = 1000; c.height = 1000;
            const ctx = c.getContext('2d');
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const s = Math.min(img.width, img.height);
                const sx = (img.width - s) / 2, sy = (img.height - s) / 2;
                ctx.drawImage(img, sx, sy, s, s, 0, 0, 1000, 1000);
                c.toBlob(b => resolve(b), 'image/jpeg', 0.95);
            };
            img.src = url;
        });
        allBlobs.push({ blob, name: `${currentProduct.code}_thumbnail_${i + 1}.jpg` });
        const _l = document.querySelector('.loading'); if (_l) _l.textContent = `썸네일 생성 중... (${i + 1}/${stylingKeys.length})`;
    }

    // 3. 서버에 보내서 폴더 저장
    const formData = new FormData();
    formData.append('code', currentProduct.code);
    allBlobs.forEach(({ blob, name }) => formData.append('files', blob, name));
    const basePath = document.getElementById('imagePath')?.value?.trim() || '';
    formData.append('base_path', basePath);

    try {
        const resp = await fetch('/api/save-all-to-folder', { method: 'POST', body: formData });
        const data = await resp.json();
        if (data.success) {
            alert(`저장 완료! (${data.count}개 파일)\n폴더: ${data.folder}`);
            // 폴더 열기
            fetch('/api/open-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder: data.folder })
            });
        } else {
            alert('저장 실패: ' + data.error);
        }
    } catch (e) { alert('저장 오류: ' + e.message); }

    hideLoading();
}

// === Export (html2canvas - 화면 그대로 캡처) ===
async function exportCurrent() {
    if (!currentProduct) { alert('상품을 먼저 선택해주세요'); return; }
    allProductImages[currentProduct.code] = { imageSlots: { ...imageSlots }, slotConfigs: { ...slotConfigs } };
    showLoading('Export 중... (잠시 기다려주세요)');

    try {
        const template = document.getElementById('template');

        // 빈 슬롯 + 순서 버튼 숨기기
        const emptySlots = template.querySelectorAll('.image-slot:not(.has-image)');
        emptySlots.forEach(el => { el.dataset.wasVisible = el.style.display; el.style.display = 'none'; });
        const orderBtns = template.querySelectorAll('.styling-order-btns');
        orderBtns.forEach(el => el.style.display = 'none');

        // 스크롤 위치 초기화 + 전체 높이 캡처
        const wrapper = document.getElementById('templateWrapper');
        const prevScroll = wrapper.scrollTop;
        wrapper.scrollTop = 0;

        const canvas = await html2canvas(template, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            width: 800,
            height: template.scrollHeight,
            windowWidth: 800,
            windowHeight: template.scrollHeight,
            scrollY: 0,
            scrollX: 0,
        });

        wrapper.scrollTop = prevScroll;

        // 빈 슬롯 + 순서 버튼 복원
        emptySlots.forEach(el => { el.style.display = el.dataset.wasVisible || ''; });
        orderBtns.forEach(el => el.style.display = '');

        // JPG 다운로드
        const link = document.createElement('a');
        link.download = `${currentProduct.code}_detail.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.95);
        link.click();

        // 서버에도 저장
        canvas.toBlob(async (blob) => {
            const formData = new FormData();
            formData.append('file', blob, `${currentProduct.code}_detail.jpg`);
            formData.append('code', currentProduct.code);
            try {
                await fetch('/api/save-export', { method: 'POST', body: formData });
            } catch (e) { /* 서버 저장 실패해도 다운로드는 됨 */ }
        }, 'image/jpeg', 0.95);

    } catch (e) {
        alert('Export 오류: ' + e.message);
        console.error(e);
    } finally {
        hideLoading();
    }
}

async function exportAllToFolders() {
    if (!products.length) { alert('상품을 먼저 로드해주세요'); return; }
    if (currentProduct) allProductImages[currentProduct.code] = { imageSlots: { ...imageSlots }, slotConfigs: { ...slotConfigs } };

    const codesWithImages = Object.keys(allProductImages).filter(code =>
        Object.keys(allProductImages[code].imageSlots).length > 0
    );

    if (!codesWithImages.length) { alert('이미지가 배치된 상품이 없습니다'); return; }
    if (!confirm(`${codesWithImages.length}개 품번을 일괄 저장합니다.\n계속하시겠습니까?`)) return;

    showLoading(`전체 저장 중... (0/${codesWithImages.length})`);

    for (let ci = 0; ci < codesWithImages.length; ci++) {
        const code = codesWithImages[ci];
        const _l = document.querySelector('.loading'); if (_l) _l.textContent = `저장 중... ${code} (${ci + 1}/${codesWithImages.length})`;

        await selectProduct(code);
        await new Promise(r => setTimeout(r, 500));

        const allBlobs = [];

        // 상세페이지 캡처
        try {
            const template = document.getElementById('template');
            const emptySlots = template.querySelectorAll('.image-slot:not(.has-image)');
            emptySlots.forEach(el => { el.dataset.wasVisible = el.style.display; el.style.display = 'none'; });

            const wrapper2 = document.getElementById('templateWrapper');
            wrapper2.scrollTop = 0;
            const canvas = await html2canvas(template, {
                scale: 2, useCORS: true, backgroundColor: '#ffffff',
                width: 800, height: template.scrollHeight,
                windowWidth: 800, windowHeight: template.scrollHeight,
                scrollY: 0, scrollX: 0,
            });
            emptySlots.forEach(el => { el.style.display = el.dataset.wasVisible || ''; });

            const detailBlob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95));
            allBlobs.push({ blob: detailBlob, name: `${code}_detail.jpg` });
        } catch (e) { console.error(`${code} 상세페이지 캡처 실패:`, e); }

        // 썸네일 생성
        const stylingKeys = [];
        for (let i = 1; i <= 30; i++) {
            if (imageSlots[`styling_${i}`]) stylingKeys.push(`styling_${i}`);
        }
        for (let i = 0; i < stylingKeys.length; i++) {
            const key = stylingKeys[i];
            const url = `/uploads/${imageSlots[key]}`;
            const blob = await new Promise((resolve) => {
                const c = document.createElement('canvas');
                c.width = 1000; c.height = 1000;
                const ctx = c.getContext('2d');
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    const s = Math.min(img.width, img.height);
                    const sx = (img.width - s) / 2, sy = (img.height - s) / 2;
                    ctx.drawImage(img, sx, sy, s, s, 0, 0, 1000, 1000);
                    c.toBlob(b => resolve(b), 'image/jpeg', 0.95);
                };
                img.src = url;
            });
            allBlobs.push({ blob, name: `${code}_thumbnail_${i + 1}.jpg` });
        }

        // 서버에 폴더 저장
        const formData = new FormData();
        formData.append('code', code);
        formData.append('base_path', document.getElementById('imagePath')?.value?.trim() || '');
        allBlobs.forEach(({ blob, name }) => formData.append('files', blob, name));
        let savedFolder = '';
        try {
            const r = await fetch('/api/save-all-to-folder', { method: 'POST', body: formData });
            savedFolder = (await r.json()).folder || '';
        } catch (e) { console.error(`${code} 저장 실패:`, e); }
    }

    hideLoading();
    alert(`${codesWithImages.length}개 품번 저장 완료!`);
}

// === 장바구니 ===
function openCart() {
    const modal = document.getElementById('cartModal');
    modal.style.display = 'flex';
    renderCartList();
}

function closeCart() {
    document.getElementById('cartModal').style.display = 'none';
}

function renderCartList() {
    const list = document.getElementById('cartList');
    const saved = loadState();
    const savedProducts = saved?.allProductImages || allProductImages;
    const codes = Object.keys(savedProducts).filter(code =>
        Object.keys(savedProducts[code]?.imageSlots || {}).length > 0
    );

    if (!codes.length) {
        list.innerHTML = '<p style="color:#999; text-align:center; padding:40px;">임시저장된 품번이 없습니다</p>';
        return;
    }

    list.innerHTML = codes.map(code => {
        const slots = savedProducts[code]?.imageSlots || {};
        const imgCount = Object.keys(slots).length;
        const mainImg = slots.main ? `/uploads/${slots.main}` : '';
        const product = products.find(p => p.code === code);
        const name = product?.main_name || product?.name || '';

        return `<div class="cart-item" style="display:flex; align-items:center; gap:15px; padding:12px; border-bottom:1px solid #eee;">
            <input type="checkbox" class="cart-check" data-code="${code}" checked style="width:20px; height:20px; cursor:pointer;">
            <div style="width:60px; height:60px; border-radius:8px; overflow:hidden; background:#f0f0f0; flex-shrink:0;">
                ${mainImg ? `<img src="${mainImg}" style="width:100%; height:100%; object-fit:cover;">` : ''}
            </div>
            <div style="flex:1;">
                <div style="font-weight:bold; font-size:15px;">${code}</div>
                <div style="font-size:13px; color:#666; margin-top:2px;">${name}</div>
                <div style="font-size:12px; color:#999; margin-top:2px;">이미지 ${imgCount}개</div>
            </div>
            <button onclick="selectProduct('${code}'); closeCart();" style="padding:5px 12px; background:#6430e9; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px;">편집</button>
        </div>`;
    }).join('');
}

function cartSelectAll() {
    document.querySelectorAll('.cart-check').forEach(cb => cb.checked = true);
}
function cartDeselectAll() {
    document.querySelectorAll('.cart-check').forEach(cb => cb.checked = false);
}

async function cartDownloadSelected() {
    const checked = [...document.querySelectorAll('.cart-check:checked')].map(cb => cb.dataset.code);
    if (!checked.length) { alert('선택된 품번이 없습니다'); return; }
    if (!confirm(`${checked.length}개 품번을 다운로드합니다.`)) return;

    closeCart();
    showLoading(`다운로드 중... (0/${checked.length})`);

    for (let ci = 0; ci < checked.length; ci++) {
        const code = checked[ci];
        const _l = document.querySelector('.loading'); if (_l) _l.textContent = `저장 중... ${code} (${ci + 1}/${checked.length})`;

        await selectProduct(code);
        await new Promise(r => setTimeout(r, 500));

        const allBlobs = [];

        // 상세페이지
        try {
            const template = document.getElementById('template');
            const emptySlots = template.querySelectorAll('.image-slot:not(.has-image)');
            emptySlots.forEach(el => { el.dataset.wasVisible = el.style.display; el.style.display = 'none'; });
            const ob = template.querySelectorAll('.styling-order-btns');
            ob.forEach(el => el.style.display = 'none');
            const wrapper = document.getElementById('templateWrapper');
            wrapper.scrollTop = 0;
            const canvas = await html2canvas(template, {
                scale: 2, useCORS: true, backgroundColor: '#ffffff',
                width: 800, height: template.scrollHeight,
                windowWidth: 800, windowHeight: template.scrollHeight,
                scrollY: 0, scrollX: 0,
            });
            emptySlots.forEach(el => { el.style.display = el.dataset.wasVisible || ''; });
            ob.forEach(el => el.style.display = '');
            const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95));
            allBlobs.push({ blob, name: `${code}_detail.jpg` });
        } catch (e) { console.error(e); }

        // 썸네일
        for (let i = 1; i <= 30; i++) {
            if (!imageSlots[`styling_${i}`]) continue;
            const url = `/uploads/${imageSlots[`styling_${i}`]}`;
            const blob = await new Promise((resolve) => {
                const c = document.createElement('canvas');
                c.width = 1000; c.height = 1000;
                const ctx = c.getContext('2d');
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    const s = Math.min(img.width, img.height);
                    ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 1000, 1000);
                    c.toBlob(b => resolve(b), 'image/jpeg', 0.95);
                };
                img.src = url;
            });
            allBlobs.push({ blob, name: `${code}_thumbnail_${i}.jpg` });
        }

        // 서버 폴더 저장
        const formData = new FormData();
        formData.append('code', code);
        formData.append('base_path', document.getElementById('imagePath')?.value?.trim() || '');
        allBlobs.forEach(({ blob, name }) => formData.append('files', blob, name));
        try { await fetch('/api/save-all-to-folder', { method: 'POST', body: formData }); } catch (e) {}
    }

    hideLoading();
    fetch('/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: 'exports' })
    });
    alert(`${checked.length}개 품번 저장 완료!`);
}

function cartClearSelected() {
    const checked = [...document.querySelectorAll('.cart-check:checked')].map(cb => cb.dataset.code);
    if (!checked.length) { alert('선택된 품번이 없습니다'); return; }
    if (!confirm(`${checked.length}개 품번의 임시저장 데이터를 삭제합니다.`)) return;

    checked.forEach(code => {
        delete allProductImages[code];
    });
    saveState();
    renderCartList();
}

// === 유틸 ===
function showLoading(msg) {
    let el = document.querySelector('.loading');
    if (!el) { el = document.createElement('div'); el.className = 'loading'; document.body.appendChild(el); }
    el.textContent = msg || '처리 중...'; el.style.display = 'flex';
}
function hideLoading() { const el = document.querySelector('.loading'); if (el) el.style.display = 'none'; }

// === 제품컷 스와이프로 순서 변경 ===
// 전역 스와이프 시스템 (이벤트 위임)
let swipeState = { active: false, slot: null, sx: 0, sy: 0, vertical: false, selector: '' };
let swipeRegistered = {};

function initDirectSwipe(selector, vertical) {
    const slots = document.querySelectorAll(selector);
    if (!slots.length) return;

    // 이미 등록된 selector면 스킵 (중복 방지)
    const key = selector + (vertical ? '_v' : '_h');
    if (swipeRegistered[key]) return;
    swipeRegistered[key] = true;

    document.addEventListener('mousedown', (e) => {
        const slot = e.target.closest(selector);
        if (!slot) return;
        if (e.target.tagName === 'INPUT' || e.target.closest('.product-color-overlay')) return;

        swipeState = { active: true, slot, sx: e.clientX, sy: e.clientY, vertical, selector };
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!swipeState.active || swipeState.selector !== selector) return;
        const { slot, sx, sy } = swipeState;
        const dx = e.clientX - sx;
        const dy = e.clientY - sy;
        const d = vertical ? dy : dx;

        if (Math.abs(d) > 10) {
            slot.style.opacity = `${1 - Math.min(Math.abs(d) / 200, 0.3)}`;
            slot.style.transform = vertical ? `translateY(${d * 0.2}px)` : `translateX(${d * 0.2}px)`;
        }

        if (Math.abs(d) > 80) {
            slot.style.opacity = ''; slot.style.transform = '';
            swipeState.active = false;

            const allSlots = document.querySelectorAll(selector);
            const names = Array.from(allSlots).map(el => el.dataset.slot).filter(Boolean);
            const idx = names.indexOf(slot.dataset.slot);
            let ti = d > 0 ? idx + 1 : idx - 1;
            if (ti < 0) ti = names.length - 1;
            if (ti >= names.length) ti = 0;

            swapSlots(names[idx], names[ti]);
        }
    });

    document.addEventListener('mouseup', () => {
        if (swipeState.active && swipeState.slot) {
            swipeState.slot.style.opacity = '';
            swipeState.slot.style.transform = '';
        }
        swipeState.active = false;
    });
}

function initSwipe(selector) {
    const slots = document.querySelectorAll(selector);
    const slotNames = Array.from(slots).map(el => el.dataset.slot).filter(Boolean);
    const isVertical = selector.includes('styling');

    slots.forEach(slot => {
        let startX = 0, startY = 0;
        let swiping = false;

        slot.addEventListener('pointerdown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.closest('.product-color-overlay')) return;
            startX = e.clientX;
            startY = e.clientY;
            swiping = true;
            slot.setPointerCapture(e.pointerId);
        });

        slot.addEventListener('pointermove', (e) => {
            if (!swiping) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const d = isVertical ? dy : dx;

            // 드래그 중 시각 피드백 (살짝 이동)
            const img = slot.querySelector('img.slot-img');
            if (img && Math.abs(d) > 10) {
                slot.style.opacity = `${1 - Math.min(Math.abs(d) / 200, 0.4)}`;
                slot.style.transform = isVertical
                    ? `translateY(${d * 0.3}px)`
                    : `translateX(${d * 0.3}px)`;
            }

            // 80px 이상이면 스왑
            if (Math.abs(d) > 80) {
                swiping = false;
                resetSlotStyle(slot);

                const idx = slotNames.indexOf(slot.dataset.slot);
                let targetIdx = d > 0 ? idx + 1 : idx - 1;
                if (targetIdx < 0) targetIdx = slotNames.length - 1;
                if (targetIdx >= slotNames.length) targetIdx = 0;

                const targetSlot = document.querySelector(`[data-slot="${slotNames[targetIdx]}"]`);

                // 스왑 애니메이션
                animateSwap(slot, targetSlot, isVertical, d > 0);
                swapSlots(slotNames[idx], slotNames[targetIdx]);
            }
        });

        slot.addEventListener('pointerup', () => {
            swiping = false;
            resetSlotStyle(slot);
        });
        slot.addEventListener('pointercancel', () => {
            swiping = false;
            resetSlotStyle(slot);
        });
    });
}

function resetSlotStyle(slot) {
    slot.style.opacity = '';
    slot.style.transform = '';
    slot.style.transition = 'opacity 0.2s, transform 0.2s';
    setTimeout(() => { slot.style.transition = ''; }, 200);
}

function animateSwap(slotA, slotB, isVertical, forward) {
    if (!slotA || !slotB) return;
    const prop = isVertical ? 'translateY' : 'translateX';
    const dist = forward ? '-30px' : '30px';

    [slotA, slotB].forEach(s => {
        s.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
        s.style.opacity = '0.6';
        s.style.transform = `${prop}(${dist})`;
    });

    setTimeout(() => {
        [slotA, slotB].forEach(s => {
            s.style.opacity = '1';
            s.style.transform = '';
        });
        setTimeout(() => {
            [slotA, slotB].forEach(s => { s.style.transition = ''; });
        }, 250);
    }, 50);
}

// 착장컷 순서 변경 - 번호 클릭 시 이동할 위치 입력
function moveStylingTo(fromNum) {
    const toNum = prompt(`${fromNum}번 이미지를 몇 번으로 이동?`, fromNum);
    if (!toNum || isNaN(toNum) || parseInt(toNum) === fromNum) return;
    const to = parseInt(toNum);

    // fromNum → toNum으로 이미지 밀어넣기 (중간 것들 순서 밀림)
    const from = fromNum;
    const dir = to > from ? 1 : -1;
    for (let i = from; i !== to; i += dir) {
        swapSlots(`styling_${i}`, `styling_${i + dir}`);
    }
    renderStylingSlots();
    restoreImages();
    renderThumbnails();
}

// 제품컷 순서 변경 (화살표 버튼)
function swapProducts(fromIdx, toIdx) {
    const slotA = `product_${fromIdx + 1}`;
    const slotB = `product_${toIdx + 1}`;
    swapSlots(slotA, slotB);
    // 컬러명도 스왑
    if (currentProduct?.colors) {
        const colors = currentProduct.colors;
        if (colors[fromIdx] && colors[toIdx]) {
            [colors[fromIdx], colors[toIdx]] = [colors[toIdx], colors[fromIdx]];
        }
    }
    renderTemplate();
    renderStylingSlots();
    restoreImages();
    extractColorChips();
}

function swapSlots(slotA, slotB) {
    if (!slotA || !slotB || slotA === slotB) return;

    // 파일만 스왑, config는 리셋 (고정 위치로)
    const tempFile = imageSlots[slotA];
    imageSlots[slotA] = imageSlots[slotB];
    imageSlots[slotB] = tempFile;

    // 둘 다 위치/줌 초기화
    slotConfigs[slotA] = { zoom: 1.0, offsetX: 0, offsetY: 0 };
    slotConfigs[slotB] = { zoom: 1.0, offsetX: 0, offsetY: 0 };

    // 이미지 갱신
    [slotA, slotB].forEach(name => {
        const el = document.querySelector(`[data-slot="${name}"]`);
        if (!el) return;
        if (imageSlots[name]) {
            placeImage(el, `/uploads/${imageSlots[name]}`);
        } else {
            el.classList.remove('has-image');
            const img = el.querySelector('img.slot-img');
            if (img) img.remove();
        }
    });

    extractColorChips();
}

// === 더블클릭 텍스트 편집 ===
function makeEditable(el) {
    if (el.classList.contains('editing')) return;
    el.classList.add('editing');
    el.contentEditable = true;
    el.focus();

    // 텍스트 전체 선택
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const finish = () => {
        el.contentEditable = false;
        el.classList.remove('editing');
    };
    el.onblur = finish;
    el.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(); }
        if (e.key === 'Escape') { finish(); }
    };
}

function makeEditableMulti(el) {
    if (el.classList.contains('editing')) return;
    el.classList.add('editing');
    el.contentEditable = true;
    el.focus();

    const finish = () => {
        el.contentEditable = false;
        el.classList.remove('editing');
    };
    el.onblur = finish;
    el.onkeydown = (e) => {
        if (e.key === 'Escape') { finish(); }
    };
}

// === 컬러명 수정 ===
function updateColorName(input) {
    const idx = parseInt(input.dataset.colorIdx);
    const lang = input.dataset.lang;
    if (currentProduct && currentProduct.colors && currentProduct.colors[idx]) {
        currentProduct.colors[idx][lang] = input.value;
    }
}

document.addEventListener('keydown', () => { /* future use */ });

// === 컬러칩 색상 추출 ===
async function extractColorChips() {
    const colors = currentProduct?.colors || [];
    for (let i = 0; i < colors.length; i++) {
        const filename = imageSlots[`product_${i + 1}`];
        const chipEl = document.getElementById(`colorChip_${i}`);
        if (!filename || !chipEl) continue;

        try {
            const resp = await fetch('/api/extract-color', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename })
            });
            const data = await resp.json();
            if (data.success) {
                chipEl.style.background = data.hex;
                chipEl.style.border = `1px solid #c6c6c6`;
            }
        } catch (e) {
            console.error('색상 추출 실패:', e);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const saved = loadState();
    if (saved) {
        // 입력값 복원
        if (saved.sheetId) document.getElementById('sheetId').value = saved.sheetId;
        if (saved.imagePath) document.getElementById('imagePath').value = saved.imagePath;
        if (saved.allProductImages) allProductImages = saved.allProductImages;
        if (saved.thumbStates) window.thumbStates = saved.thumbStates;

        // 시트가 있으면 자동 로드 제안
        if (saved.sheetId) {
            const restore = confirm(`이전 작업이 있습니다 (${saved.savedAt?.slice(0, 16)})\n이어서 작업하시겠습니까?`);
            if (restore) {
                loadSheet().then(() => {
                    // 마지막 품번 선택
                    if (saved.lastProduct && products.find(p => p.code === saved.lastProduct)) {
                        selectProduct(saved.lastProduct);
                    }
                });
            }
        }
    }
});

// === 썸네일 생성 (착장컷 정방형 크롭) ===
function renderThumbnails() {
    const section = document.getElementById('thumbnailSection');
    const grid = document.getElementById('thumbnailGrid');
    if (!section || !grid || !currentProduct) return;

    // 착장컷 이미지 찾기
    const stylingKeys = [];
    for (let i = 1; i <= 30; i++) {
        if (imageSlots[`styling_${i}`]) stylingKeys.push(`styling_${i}`);
    }

    if (stylingKeys.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    grid.innerHTML = '';

    // 썸네일 상태 저장
    if (!window.thumbStates) window.thumbStates = {};

    stylingKeys.forEach((key, idx) => {
        const url = `/uploads/${imageSlots[key]}`;
        const state = window.thumbStates[key] || { zoom: 1.0, ox: 0, oy: 0 };
        window.thumbStates[key] = state;

        const item = document.createElement('div');
        item.style.cssText = 'position:relative; width:100%; aspect-ratio:1; border-radius:12px; overflow:hidden; background:#fff; cursor:grab;';

        const img = document.createElement('img');
        img.src = url;
        img.style.cssText = `position:absolute; left:0; top:0; width:100%; height:100%; object-fit:contain; transform-origin:center; transform:scale(${state.zoom}) translate(${state.ox}px, ${state.oy}px); pointer-events:none;`;
        item.appendChild(img);

        // 마우스휠 확대/축소
        item.addEventListener('wheel', (e) => {
            e.preventDefault();
            state.zoom = Math.max(0.5, Math.min(3.0, state.zoom + (e.deltaY < 0 ? 0.1 : -0.1)));
            img.style.transform = `scale(${state.zoom}) translate(${state.ox}px, ${state.oy}px)`;
        });

        // 드래그 이동
        let dragging = false, sx = 0, sy = 0;
        item.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            dragging = true; sx = e.clientX; sy = e.clientY;
            item.style.cursor = 'grabbing';
        });
        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            state.ox += (e.clientX - sx) / state.zoom;
            state.oy += (e.clientY - sy) / state.zoom;
            sx = e.clientX; sy = e.clientY;
            img.style.transform = `scale(${state.zoom}) translate(${state.ox}px, ${state.oy}px)`;
        });
        document.addEventListener('mouseup', () => { dragging = false; item.style.cursor = 'grab'; });

        // 개별 저장 버튼
        const btn = document.createElement('button');
        btn.textContent = '저장';
        btn.style.cssText = 'position:absolute; bottom:5px; right:5px; padding:3px 10px; background:rgba(100,47,233,0.9); color:#fff; border:none; border-radius:6px; font-size:12px; cursor:pointer; z-index:2;';
        btn.onclick = (e) => { e.stopPropagation(); saveSingleThumbnail(key, idx + 1); };
        item.appendChild(btn);

        // 번호 표시
        const num = document.createElement('span');
        num.textContent = idx + 1;
        num.style.cssText = 'position:absolute; top:5px; left:5px; background:rgba(0,0,0,0.6); color:#fff; padding:2px 8px; border-radius:4px; font-size:12px; z-index:2;';
        item.appendChild(num);

        grid.appendChild(item);
    });
}

function saveSingleThumbnail(imgUrl, idx) {
    const canvas = document.createElement('canvas');
    const size = 1000; // 정방형 1000x1000
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        // 중앙 크롭
        const s = Math.min(img.width, img.height);
        const sx = (img.width - s) / 2;
        const sy = (img.height - s) / 2;
        ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);

        canvas.toBlob(blob => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${currentProduct.code}_thumbnail_${idx}.jpg`;
            a.click();
            URL.revokeObjectURL(a.href);
        }, 'image/jpeg', 0.95);
    };
    img.src = imgUrl;
}

async function saveAllThumbnails() {
    const stylingKeys = [];
    for (let i = 1; i <= 30; i++) {
        if (imageSlots[`styling_${i}`]) stylingKeys.push(`styling_${i}`);
    }

    if (!stylingKeys.length) { alert('착장컷 이미지가 없습니다'); return; }
    showLoading(`썸네일 저장 중... (0/${stylingKeys.length})`);

    // 서버에서 일괄 처리
    const blobs = [];
    for (let i = 0; i < stylingKeys.length; i++) {
        const key = stylingKeys[i];
        const url = `/uploads/${imageSlots[key]}`;
        const blob = await new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const size = 1000;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const s = Math.min(img.width, img.height);
                const sx = (img.width - s) / 2;
                const sy = (img.height - s) / 2;
                ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
                canvas.toBlob(b => resolve(b), 'image/jpeg', 0.95);
            };
            img.src = url;
        });
        blobs.push({ blob, name: `${currentProduct.code}_thumbnail_${i + 1}.jpg` });
        const _l = document.querySelector('.loading'); if (_l) _l.textContent = `썸네일 저장 중... (${i + 1}/${stylingKeys.length})`;
    }

    // FormData로 서버에 보내서 zip 반환
    const formData = new FormData();
    formData.append('code', currentProduct.code);
    blobs.forEach(({ blob, name }) => {
        formData.append('files', blob, name);
    });

    try {
        const resp = await fetch('/api/save-thumbnails', { method: 'POST', body: formData });
        const data = await resp.json();
        if (data.success) {
            // zip 다운로드
            const a = document.createElement('a');
            a.href = data.url;
            a.download = data.filename;
            a.click();
        }
    } catch (e) {
        // 서버 실패 시 개별 다운로드
        for (const { blob, name } of blobs) {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = name;
            a.click();
            URL.revokeObjectURL(a.href);
            await new Promise(r => setTimeout(r, 200));
        }
    }

    hideLoading();
}
