let matrixWidth = 128, matrixHeight = 160, scale = 3.5;
let items = [], selectedIndex = -1, isDragging = false;
let dragStartX = 0, dragStartY = 0;
let isPowerOn = true;
let isAutoSchedule = true;
let ledBrightness = 110; // Biến lưu độ sáng mặc định (10 - 255)
let lastShiftTriggered = ""; // Biến chống trùng lặp ca trong cùng một phút

// QUẢN LÝ CÁC CHẾ ĐỘ VÀ MẪU CỐ ĐỊNH
let appMode = "custom"; // "custom", "fixed_info", "fixed_logo", "fixed_qr"
let fixedNoticeText = "Chào mừng quý đại biểu và sinh viên đến với Khoa KTCK CTUT!";
let fixedNoticeColor = "#ffeb3b";
let fixedLogoColor = "#00e676";
let fixedQRColor = "#ffffff";

const canvas = document.getElementById('ledCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;

// --- CẤU HÌNH MQTT HIVEMQ WEBSOCKETS ---
const MQTT_HOST = "99fca9113135489daf4a8b7784585df6.s1.eu.hivemq.cloud";
const MQTT_PORT = 8884;
const MQTT_PATH = "/mqtt";
const MQTT_CLIENT_ID = "Web_Client_" + Math.floor(Math.random() * 10000);

const mqttClient = new Paho.Client(MQTT_HOST, MQTT_PORT, MQTT_PATH, MQTT_CLIENT_ID);

function updateMQTTStatus(connected, text) {
    const badge = document.getElementById('mqttStatus');
    if (!badge) return;
    if (connected) {
        badge.className = "status-badge connected";
        badge.innerText = "🟢 " + (text || "Đã kết nối HiveMQ");
    } else {
        badge.className = "status-badge disconnected";
        badge.innerText = "🔴 " + (text || "Mất kết nối Server");
    }
}

mqttClient.onConnectionLost = (responseObject) => {
    updateMQTTStatus(false, "Mất kết nối MQTT");
    if (responseObject.errorCode !== 0) {
        console.log("MQTT Connection Lost: " + responseObject.errorMessage);
        setTimeout(initMQTT, 3000);
    }
};

function initMQTT() {
    console.log("Connecting to HiveMQ WebSocket...");
    updateMQTTStatus(false, "Đang kết nối Server...");
    
    mqttClient.connect({
        useSSL: true, 
        userName: "ESP32_MATRIX_LED", 
        password: "Thanhnghi_200104",
        keepAliveInterval: 30,
        cleanSession: false,
        onSuccess: () => {
            console.log("🟢 MQTT Connected successfully!");
            updateMQTTStatus(true, "Đã kết nối HiveMQ");
        },
        onFailure: (e) => {
            console.log("🔴 MQTT Fail:", e);
            updateMQTTStatus(false, "Lỗi kết nối Server");
            setTimeout(initMQTT, 5000);
        }
    });
}

function formatTimeHHMM(timeStr) {
    if (!timeStr) return "";
    let parts = timeStr.split(":");
    if (parts.length < 2) return timeStr;
    let h = parts[0].padStart(2, '0');
    let m = parts[1].padStart(2, '0');
    return `${h}:${m}`;
}

// --- XỬ LÝ ĐĂNG NHẬP VÀ ĐỔI MẬT KHẨU ---
function login() {
    const userEl = document.getElementById('txtUsername');
    const passEl = document.getElementById('txtPasscode');
    const user = userEl ? userEl.value.trim() : "";
    const pass = passEl ? passEl.value : "";

    const savedUser = localStorage.getItem('app_username') || "KTCK";
    const savedPass = localStorage.getItem('app_passcode') || "123456";

    if (user === savedUser && pass === savedPass) {
        const loginModal = document.getElementById('loginModal');
        const mainApp = document.getElementById('mainApp');
        if (loginModal) loginModal.style.display = 'none';
        if (mainApp) mainApp.style.display = 'block';
        applyMatrixSize();
        updatePresetsUI();
    } else { 
        alert("Tên đăng nhập hoặc mật khẩu không chính xác!"); 
    }
}

function logout() { location.reload(); }

function openChangePassModal() { 
    const modal = document.getElementById('changePassModal');
    if (modal) modal.style.display = 'flex'; 
}

function closeChangePassModal() { 
    const modal = document.getElementById('changePassModal');
    if (modal) modal.style.display = 'none'; 
}

function saveNewPassword() {
    const oldP = document.getElementById('oldPass')?.value || "";
    const newP = document.getElementById('newPass')?.value || "";
    const confirmP = document.getElementById('confirmNewPass')?.value || "";
    const currentP = localStorage.getItem('app_passcode') || "123456";

    if (oldP !== currentP) return alert("❌ Mật khẩu cũ không đúng!");
    if (newP.length < 4) return alert("⚠ Mật khẩu mới phải từ 4 ký tự trở lên!");
    if (newP !== confirmP) return alert("⚠️ Mật khẩu mới và Xác nhận mật khẩu không trùng khớp!");

    localStorage.setItem('app_passcode', newP);
    alert("🔑 Đổi mật khẩu thành công!");
    
    if (document.getElementById('oldPass')) document.getElementById('oldPass').value = "";
    if (document.getElementById('newPass')) document.getElementById('newPass').value = "";
    if (document.getElementById('confirmNewPass')) document.getElementById('confirmNewPass').value = "";
    
    closeChangePassModal();
}

function toggleAutoSchedule() {
    isAutoSchedule = !isAutoSchedule;
    const btn = document.getElementById('btnToggleAuto');
    if (btn) {
        if (isAutoSchedule) {
            btn.className = "btn-success";
            btn.innerText = "🟢 ĐANG BẬT TỰ ĐỘNG";
        } else {
            btn.className = "btn-danger";
            btn.innerText = "🔴 ĐÃ TẮT TỰ ĐỘNG";
        }
    }
}

// --- XỬ LÝ ĐỘ SÁNG BẢNG LED ---
function updateBrightness() {
    const rng = document.getElementById('rngBrightness');
    const lbl = document.getElementById('brightnessVal');
    if (rng) {
        ledBrightness = parseInt(rng.value) || 110;
        if (lbl) lbl.innerText = ledBrightness;
    }
    sendMQTT(true); // Gửi ngầm cấu hình độ sáng xuống ESP32 ngay khi kéo thanh trượt
}

// --- QUẢN LÝ CHẾ ĐỘ VÀ CÁC MẪU CỐ ĐỊNH ---
function changeAppMode() {
    const selMode = document.getElementById('selAppMode');
    if (!selMode) return;
    appMode = selMode.value;

    const cardEditor = document.getElementById('cardTextEditor');
    const noticeBox = document.getElementById('fixedNoticeBox');
    const boxLogo = document.getElementById('boxColorLogo');
    const boxQR = document.getElementById('boxColorQR');

    if (appMode === "custom") {
        if (cardEditor) cardEditor.style.display = "block";
        if (noticeBox) noticeBox.style.display = "none";
    } else {
        if (cardEditor) cardEditor.style.display = "none";
        if (noticeBox) noticeBox.style.display = "block";

        if (boxLogo) boxLogo.style.display = (appMode === "fixed_logo") ? "block" : "none";
        if (boxQR) boxQR.style.display = (appMode === "fixed_qr") ? "block" : "none";
    }
    render();
}

function updateFixedNotice() {
    const txtNotice = document.getElementById('txtFixedNotice');
    const colNotice = document.getElementById('colNoticeColor');
    const colLogo = document.getElementById('colLogoColor');
    const colQR = document.getElementById('colQRColor');

    if (txtNotice) fixedNoticeText = txtNotice.value;
    if (colNotice) fixedNoticeColor = colNotice.value;
    if (colLogo) fixedLogoColor = colLogo.value;
    if (colQR) fixedQRColor = colQR.value;

    render();
    sendMQTT(true); 
}

// --- KÍCH THƯỚC MA TRẬN & NÚT BẤM ---
function applyMatrixSize() {
    matrixWidth = 128;
    matrixHeight = 160;
    if (canvas) {
        canvas.width = matrixWidth * scale;
        canvas.height = matrixHeight * scale;
    }
    render();
}

function addText() {
    if (appMode !== "custom") {
        return alert("⚠️ Bạn đang ở chế độ Mẫu Cố Định. Vui lòng chuyển về 'Mẫu Tự Do' để thêm văn bản!");
    }
    items.push({ 
        type: "text", text: "Nhập nội dung", 
        x: 0, y: 15, size: 16, 
        color: "#00e676", align: "left", 
        font: "vietnamese", effect: "static", speed: 5 
    });
    selectedIndex = items.length - 1;
    syncControlPanel();
    render();
}

function deleteSelectedItem() {
    if (selectedIndex !== -1 && appMode === "custom") {
        items.splice(selectedIndex, 1);
        selectedIndex = -1;
        render();
    }
}

function syncControlPanel() {
    if (appMode !== "custom") return;
    if (selectedIndex === -1) return;
    let item = items[selectedIndex];

    if (document.getElementById('txtText')) document.getElementById('txtText').value = item.text || '';
    if (document.getElementById('txtX')) document.getElementById('txtX').value = item.x;
    if (document.getElementById('txtY')) document.getElementById('txtY').value = item.y;
    if (document.getElementById('txtSize')) document.getElementById('txtSize').value = item.size || 16;
    if (document.getElementById('txtColor')) document.getElementById('txtColor').value = item.color || '#00e676';
    if (document.getElementById('selAlign')) document.getElementById('selAlign').value = item.align || 'left';
    if (document.getElementById('selFont')) document.getElementById('selFont').value = item.font || 'vietnamese';
    if (document.getElementById('selEffect')) document.getElementById('selEffect').value = item.effect || 'static';
    if (document.getElementById('rngSpeed')) document.getElementById('rngSpeed').value = item.speed || 5;
}

function updateItem() {
    if (appMode !== "custom" || selectedIndex === -1) return;
    let item = items[selectedIndex];

    if (document.getElementById('txtText')) item.text = document.getElementById('txtText').value;
    if (document.getElementById('txtY')) item.y = parseInt(document.getElementById('txtY').value) || 0;
    if (document.getElementById('txtSize')) item.size = parseInt(document.getElementById('txtSize').value) || 16;
    if (document.getElementById('txtColor')) item.color = document.getElementById('txtColor').value;
    
    // Tự động căn chỉnh tọa độ X chuẩn xác theo lựa chọn Canh lề
    if (document.getElementById('selAlign')) {
        let newAlign = document.getElementById('selAlign').value;
        
        if (newAlign !== item.align) {
            item.align = newAlign;
            
            if (newAlign === 'left') {
                item.x = 0; // Chữ đụng sát mép trái
            } else if (newAlign === 'right') {
                item.x = matrixWidth; // Chữ đụng sát mép phải
            } else if (newAlign === 'center') {
                item.x = Math.floor(matrixWidth / 2); // Nằm chính giữa bảng LED
            }
        } else {
            if (document.getElementById('txtX')) item.x = parseInt(document.getElementById('txtX').value) || 0;
        }
    }

    if (document.getElementById('selFont')) item.font = document.getElementById('selFont').value;
    if (document.getElementById('selEffect')) item.effect = document.getElementById('selEffect').value;
    if (document.getElementById('rngSpeed')) item.speed = parseInt(document.getElementById('rngSpeed').value) || 5;

    if (document.getElementById('txtX')) document.getElementById('txtX').value = item.x;

    render();
}

function getEffectiveFontSize(size) {
    if (size <= 8)       return 8;   
    else if (size <= 12) return 12;  
    else if (size <= 16) return 16;  
    else                 return 24;  
}

// --- KÉO THẢ CANVAS ---
if (canvas) {
    canvas.addEventListener('pointerdown', (e) => {
        if (appMode !== "custom" || !ctx) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = Math.floor((e.clientX - rect.left) / scale);
        const mouseY = Math.floor((e.clientY - rect.top) / scale);

        const now = new Date();
        const timeStr = now.toTimeString().split(' ')[0];
        const dateStr = now.toLocaleDateString('vi-VN');

        selectedIndex = items.findIndex(item => {
            let displayStr = (item.text || '').replace(/{TIME}/g, timeStr).replace(/{DATE}/g, dateStr);
            let fontStyle = (item.font === 'vietnamese') ? 'Arial, sans-serif' : '"Courier New", monospace';
            let effectiveSize = getEffectiveFontSize(item.size || 16);
            ctx.font = `bold ${effectiveSize * scale}px ${fontStyle}`;
            
            const textWidthPx = ctx.measureText(displayStr).width / scale;
            let startX = item.x;
            if (item.align === 'center') startX = item.x - textWidthPx / 2;
            else if (item.align === 'right') startX = item.x - textWidthPx;

            return mouseX >= startX && mouseX <= startX + textWidthPx &&
                   mouseY >= item.y && mouseY <= item.y + effectiveSize;
        });

        if (selectedIndex !== -1) {
            isDragging = true;
            dragStartX = mouseX - items[selectedIndex].x;
            dragStartY = mouseY - items[selectedIndex].y;
            canvas.setPointerCapture(e.pointerId);
            syncControlPanel();
        }
        render();
    });

    canvas.addEventListener('pointermove', (e) => {
        if (isDragging && selectedIndex !== -1 && appMode === "custom") {
            const rect = canvas.getBoundingClientRect();
            items[selectedIndex].x = Math.floor((e.clientX - rect.left) / scale) - dragStartX;
            items[selectedIndex].y = Math.floor((e.clientY - rect.top) / scale) - dragStartY;
            syncControlPanel();
            render();
        }
    });

    const stopDrag = (e) => {
        if (isDragging) {
            isDragging = false;
            try { canvas.releasePointerCapture(e.pointerId); } catch(err) {}
        }
    };

    canvas.addEventListener('pointerup', stopDrag);
    canvas.addEventListener('pointercancel', stopDrag);
}

// --- VẼ CANVAS MÔ PHỎNG ---
function render() {
    if (!ctx || !canvas) return;
    ctx.fillStyle = '#000'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // MÔ PHỎNG MẪU CỐ ĐỊNH
    if (appMode !== "custom") {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        if (appMode === "fixed_info") {
            ctx.fillStyle = "#00e676";
            ctx.font = "bold 17px Arial";
            ctx.fillText("KHOA KỸ THUẬT CƠ KHÍ", canvas.width / 2, 35 * scale);
            
            ctx.fillStyle = "#00b0ff";
            ctx.font = "15px Arial";
            ctx.fillText("TRƯỜNG ĐẠI HỌC KT-CN CẦN THƠ", canvas.width / 2, 60 * scale);
        } 
        else if (appMode === "fixed_logo") {
            ctx.strokeStyle = fixedLogoColor;
            ctx.lineWidth = 3;
            ctx.strokeRect((128 - 100) / 2 * scale, 12 * scale, 100 * scale, 100 * scale);
            ctx.fillStyle = fixedLogoColor;
            ctx.font = "bold 17px Arial";
            ctx.fillText("[ LOGO CTUT ]", canvas.width / 2, 62 * scale);
        } 
        else if (appMode === "fixed_qr") {
            ctx.strokeStyle = fixedQRColor;
            ctx.lineWidth = 3;
            ctx.strokeRect((128 - 100) / 2 * scale, 12 * scale, 100 * scale, 100 * scale);
            ctx.fillStyle = fixedQRColor;
            ctx.font = "bold 17px Arial";
            ctx.fillText("[ MÃ QR CTUT ]", canvas.width / 2, 62 * scale);
        }

        ctx.fillStyle = fixedNoticeColor; 
        ctx.font = "bold 15px Arial"; 
        let displayNotice = fixedNoticeText || "Chào mừng quý đại biểu!";
        if (displayNotice.length > 32) displayNotice = displayNotice.substring(0, 32) + "...";
        ctx.fillText(displayNotice, canvas.width / 2, 138 * scale);
        return;
    }

    // MÔ PHỎNG CHẾ ĐỘ MẪU TỰ DO (CUSTOM)
    ctx.strokeStyle = '#222'; 
    ctx.lineWidth = 1; 
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    
    let panelIndex = 0;
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 2; col++) {
            let x = col * 64 * scale;
            let y = row * 32 * scale;
            ctx.strokeRect(x, y, 64 * scale, 32 * scale);
            ctx.fillStyle = '#223'; 
            ctx.font = '10px Arial';
            ctx.fillText(`P${panelIndex++}`, x + 4, y + 4);
        }
    }

    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    const dateStr = now.toLocaleDateString('vi-VN');

    items.forEach((item, index) => {
        let displayStr = (item.text || '').replace(/{TIME}/g, timeStr).replace(/{DATE}/g, dateStr);
        ctx.fillStyle = item.color || '#00e676';
        
        let fontStyle = (item.font === 'vietnamese') ? 'Arial, sans-serif' : '"Courier New", monospace';
        let effectiveSize = getEffectiveFontSize(item.size || 16);
        
        ctx.font = `bold ${effectiveSize * scale}px ${fontStyle}`;
        ctx.textBaseline = 'top'; 
        
        let align = item.align || 'left';
        ctx.textAlign = align;

        let drawX = item.x * scale;
        ctx.fillText(displayStr, drawX, item.y * scale);

        if (index === selectedIndex) {
            const textWidth = ctx.measureText(displayStr).width;
            let boxX = drawX;
            
            if (align === 'center') {
                boxX = drawX - textWidth / 2;
            } else if (align === 'right') {
                boxX = drawX - textWidth;
            }

            ctx.strokeStyle = '#00e676'; 
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(boxX - 2, item.y * scale - 2, textWidth + 4, (effectiveSize * scale) + 4);
            ctx.setLineDash([]);
        }
    });
}
setInterval(render, 1000);

// --- PRESETS VÀ CHUYỂN CA ---
function updatePresetsUI() {
    const sel = document.getElementById('selPreset');
    const shifts = document.querySelectorAll('.shift-select');
    let presets = JSON.parse(localStorage.getItem('led_presets') || '{}');
    
    if (sel) sel.innerHTML = '<option value="">-- Chọn mẫu --</option>';
    shifts.forEach(s => s.innerHTML = '<option value="">-- Không đổi --</option>');

    const fixedOptions = [
        { val: "MODE_FIXED_INFO", text: "📌 Mẫu 1: Thông Tin Khoa" },
        { val: "MODE_FIXED_LOGO", text: "📌 Mẫu 2: Logo CTUT" },
        { val: "MODE_FIXED_QR", text: "📌 Mẫu 3: Mã QR CTUT" }
    ];

    fixedOptions.forEach(opt => {
        if (sel) {
            let o = document.createElement('option');
            o.value = opt.val; o.innerText = opt.text;
            sel.appendChild(o);
        }
        shifts.forEach(s => {
            let o = document.createElement('option');
            o.value = opt.val; o.innerText = opt.text;
            s.appendChild(o);
        });
    });

    for (let name in presets) {
        if (sel) {
            let opt = document.createElement('option');
            opt.value = name; opt.innerText = name;
            sel.appendChild(opt);
        }
        shifts.forEach(s => {
            let optShift = document.createElement('option');
            optShift.value = name; optShift.innerText = name;
            s.appendChild(optShift);
        });
    }

    let shiftsData = JSON.parse(localStorage.getItem('led_shifts') || '{}');
    if (shiftsData.shift1) {
        if (document.getElementById('shift1Time')) document.getElementById('shift1Time').value = shiftsData.shift1.time || "";
        if (document.getElementById('shift1Preset')) document.getElementById('shift1Preset').value = shiftsData.shift1.preset || "";
    }
    if (shiftsData.shift2) {
        if (document.getElementById('shift2Time')) document.getElementById('shift2Time').value = shiftsData.shift2.time || "";
        if (document.getElementById('shift2Preset')) document.getElementById('shift2Preset').value = shiftsData.shift2.preset || "";
    }
}

function savePreset() {
    const nameEl = document.getElementById('presetName');
    const name = nameEl ? nameEl.value.trim() : "";
    if (!name) return alert("Vui lòng nhập tên mẫu!");

    let presets = JSON.parse(localStorage.getItem('led_presets') || '{}');
    presets[name] = { width: matrixWidth, height: matrixHeight, items: items };
    localStorage.setItem('led_presets', JSON.stringify(presets));
    if (nameEl) nameEl.value = '';
    updatePresetsUI();
    alert(`🟢 Đã lưu mẫu thành công: ${name}`);
}

function applyPresetByName(name) {
    if (name.startsWith("MODE_FIXED_")) {
        if (name === "MODE_FIXED_INFO") appMode = "fixed_info";
        else if (name === "MODE_FIXED_LOGO") appMode = "fixed_logo";
        else if (name === "MODE_FIXED_QR") appMode = "fixed_qr";
        
        const selMode = document.getElementById('selAppMode');
        if (selMode) selMode.value = appMode;
        changeAppMode();
    } else {
        appMode = "custom";
        const selMode = document.getElementById('selAppMode');
        if (selMode) selMode.value = "custom";
        changeAppMode();

        let presets = JSON.parse(localStorage.getItem('led_presets') || '{}');
        if (presets[name]) {
            matrixWidth = 128;
            matrixHeight = 160;
            items = presets[name].items || [];
            selectedIndex = -1;
        }
    }
    applyMatrixSize();
    render();
}

function loadPreset() {
    const sel = document.getElementById('selPreset');
    const name = sel ? sel.value : "";
    if (!name) return;

    applyPresetByName(name);
    alert(`📂 Đã nạp giao diện: ${name}`);
}

function deletePreset() {
    const sel = document.getElementById('selPreset');
    const name = sel ? sel.value : "";
    if (!name) return;

    if (name.startsWith("MODE_FIXED_")) return alert("❌ Các mẫu hệ thống không thể xóa!");

    if (confirm(`Bạn chắc chắn muốn xóa mẫu: ${name}?`)) {
        let presets = JSON.parse(localStorage.getItem('led_presets') || '{}');
        delete presets[name];
        localStorage.setItem('led_presets', JSON.stringify(presets));
        updatePresetsUI();
    }
}

function saveShiftSchedule() {
    const s1TimeEl = document.getElementById('shift1Time');
    const s1PresetEl = document.getElementById('shift1Preset');
    const s2TimeEl = document.getElementById('shift2Time');
    const s2PresetEl = document.getElementById('shift2Preset');

    const s1Time = formatTimeHHMM(s1TimeEl ? s1TimeEl.value : "");
    const s1Preset = s1PresetEl ? s1PresetEl.value : "";
    const s2Time = formatTimeHHMM(s2TimeEl ? s2TimeEl.value : "");
    const s2Preset = s2PresetEl ? s2PresetEl.value : "";

    if (!s1Time && !s2Time) return alert("⚠️ Vui lòng chọn ít nhất 1 mốc thời gian!");

    let shifts = { 
        shift1: { time: s1Time, preset: s1Preset }, 
        shift2: { time: s2Time, preset: s2Preset } 
    };
    localStorage.setItem('led_shifts', JSON.stringify(shifts));

    const statusEl = document.getElementById('shiftStatus');
    if (statusEl) {
        statusEl.innerText = "🟢 Đã đồng bộ lịch ca xuống ESP32! ESP32 sẽ tự chuyển ca mà không cần Web.";
    }
    
    sendMQTT(false);
}

// --- TRUYỀN DỮ LIỆU XUỐNG ESP32 ---
function sendMQTT(silent = false) {
    if (!mqttClient.isConnected()) {
        if (!silent) alert("⚠️ Kết nối MQTT bị gián đoạn. Đang kết nối lại...");
        initMQTT();
        return;
    }

    const shiftsData = JSON.parse(localStorage.getItem('led_shifts') || '{}');
    const presetsData = JSON.parse(localStorage.getItem('led_presets') || '{}');

    const payload = JSON.stringify({ 
        width: matrixWidth, 
        height: matrixHeight, 
        power: isPowerOn,
        brightness: ledBrightness, // Truyền độ sáng hiện tại xuống ESP32
        mode: appMode,
        notice: fixedNoticeText,
        notice_color: fixedNoticeColor,
        logo_color: fixedLogoColor,  
        qr_color: fixedQRColor,      
        items: items,
        shifts: shiftsData,
        presets: presetsData
    });
    
    const message = new Paho.Message(payload);
    message.destinationName = "khoacokhi/ledmatrix/config";
    message.retained = true; 

    mqttClient.send(message);

    if (!silent) {
        alert("🚀 Đã gửi toàn bộ cấu hình xuống ESP32 thành công!");
    }
}

function togglePower() {
    isPowerOn = !isPowerOn;
    const btn = document.getElementById('btnPower');
    if (btn) {
        btn.className = isPowerOn ? "btn-power-on" : "btn-power-off";
        btn.innerText = isPowerOn ? "🟢 ĐÃ BẬT BẢNG" : "🔴 ĐÃ TẮT BẢNG";
    }
    sendMQTT(true);
}

// --- TỰ ĐỘNG CHUYỂN CA Ở PHÍA CLIENT ---
setInterval(() => {
    if (!isAutoSchedule) return;

    const now = new Date();
    const currentHHMM = String(now.getHours()).padStart(2, '0') + ":" + String(now.getMinutes()).padStart(2, '0');
    
    if (lastShiftTriggered === currentHHMM) return;

    const shiftsData = JSON.parse(localStorage.getItem('led_shifts') || '{}');

    if (shiftsData.shift1 && shiftsData.shift1.time === currentHHMM && shiftsData.shift1.preset) {
        lastShiftTriggered = currentHHMM;
        applyPresetByName(shiftsData.shift1.preset);
        sendMQTT(true); 
    } else if (shiftsData.shift2 && shiftsData.shift2.time === currentHHMM && shiftsData.shift2.preset) {
        lastShiftTriggered = currentHHMM;
        applyPresetByName(shiftsData.shift2.preset);
        sendMQTT(true); 
    }
}, 1000);

document.addEventListener("DOMContentLoaded", () => {
    initMQTT();
    
    const txtFixedNotice = document.getElementById('txtFixedNotice');
    if (txtFixedNotice) txtFixedNotice.value = fixedNoticeText;
});