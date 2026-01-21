const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

// 1. 미들웨어 설정
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(cors());
app.use(express.static('public'));

// 2. 리포트 저장 폴더 설정
const REPORT_DIR = path.join(__dirname, 'public/reports');
if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
}

// 3. 설정 정보
const CONFIG = {
    HKEY: '130e008d28511f21',
    USER_ID: 'snow89',
    HYPHEN_ID: 'snow89',
    HYPHEN_PW: '10dnjf2djr!',
    PAY_NO: 'V37642074050',
    PAY_PW: '10dnjf',
    GEMINI_API_KEY: 'AIzaSyBQA5y7Ttpck8kQPiezs7Ti6geQ-yDxVAM', 
};

// 4. 시스템 프롬프트 (서식 및 계산 로직)
const DAMBAEK_PROMPT = `
# [담백스퀘어(주) 대출비서] 시스템 프롬프트

## 1. 기본 원칙
1. 출력 형태: 아래 [최종 리포트 템플릿]의 줄바꿈과 여백을 반드시 유지한다.
2. 숫자 표기: 천 단위 콤마 필수 (예: 54,400만원).

## 2. 최종 리포트 템플릿 (이 양식 그대로 출력)
──────────────────────── 

🏢 **담백스퀘어(주) 대출비서 리포트** ──────────────────────── 

📍 **1. 기본 정보**

소유자: **{소유자명}** 님
주소: {전체 주소}
전용면적: {전용면적}㎡
KB시세: **{KB시세}만원**

──────────────────────── 

💳 **2. 기대출 및 자산 평가**

{순위}순위. {은행명}: 원금 {원금}만원 / 채권최고액 {채권액}만원 ({비율}%)

총 원금합계: **{원금합계}만원**
총 채권최고액 합계: **{채권최고액합계}만원**
순자산: **{순자산}만원**
대출비율(LTV): **{LTV비율}%**

**[대출 LTV 금액별 예상표]**
ㅁ 상호금융 (방공제 적용)
LTV 80%: {계산결과}만원
LTV 85%: {계산결과}만원

ㅁ 저축은행/캐피탈 (방공제 미적용)
LTV 80%: **{LTV80_금액}만원**
LTV 90%: **{LTV90_금액}만원**

──────────────────────── 

📊 **3. 대출 한도 및 월납입금 (예상)**

**[케이스1] 생애최초 매매잔금 (구입자금)**
한도: **{C1_한도}만원**
1금융: 금리 4.3%~ / 월 원리금 {C1_월1}만원
2금융: 금리 4.0%~ / 월 원리금 {C1_월2}만원

**[케이스2] 일반 매매잔금 (무주택/1주택 처분)**
한도: **{C2_한도}만원**
1금융: 금리 4.3%~ / 월 원리금 {C2_월1}만원
2금융: 금리 4.0%~ / 월 원리금 {C2_월2}만원

**[케이스3] 전세퇴거자금 (보증금 반환)**
① 1주택자 (LTV {C3A_LTV}%): **{C3A_한도}만원**
② 다주택자 (LTV {C3B_LTV}%): **{C3B_한도}만원**

**[케이스4] 사업자 담보대출 (후순위/생활자금)**
ㅁ 상호금융 (LTV 80% - 방공제)
한도: **{C4A_한도}만원**
ㅁ 저축/캐피탈 (LTV 90%)
한도: **{C4B_한도}만원**

──────────────────────── 

➕ **[케이스5] 후순위 추가 대출**
상호금융 (80%): 가용한도 **{C5A_한도}만원**
저축/캐피탈 (90%): 가용한도 **{C5B_한도}만원**

──────────────────────── 

🔄 **[케이스6] 통대환 (갈아타기)**
상호금융 (80%): 최대 **{C6A_한도}만원**
저축/캐피탈 (90%): 최대 **{C6B_한도}만원**

──────────────────────── 

⚠️ **안내사항**
본 리포트는 입력하신 정보와 KB시세를 기반으로 한 단순 예상치입니다.
차주(고객)의 신용점수, 소득, 물건지 상황에 따라 실제 한도 및 금리는 달라질 수 있습니다.

📞 **상담문의: 박순호 대표 (010-3950-6886)**
**담백스퀘어(주) 대출비서**
────────────────────────
`;

// 5. AI 모델 초기화 (에러 방지를 위해 genAI 먼저 선언)
const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: DAMBAEK_PROMPT,
    generationConfig: {
        temperature: 0, // 창의성 제거
        topP: 0.1,
    }
});

// 6. 면적 추출 함수
function extractExclusiveArea(outList) {
    if (!outList || !Array.isArray(outList)) return null;
    const cleanText = outList.map(item => JSON.stringify(item)).join('').replace(/\\n/g, '').replace(/\s/g, '');
    const sections = cleanText.split('전유부분');
    if (sections.length < 2) return null;
    const match = sections[1].match(/(\d+\.\d+)/);
    return match ? match[0] : null;
}

// 7. API 라우트
app.post('/api/search', async (req, res) => {
    try {
        const { address } = req.body;
        const response = await axios.post('https://api.hyphen.im/in0004000168', {
            kindcls: '', admin_regn1: '', cls_flag: '현행', simple_address: address, detailYn: '', limitPage: '10', pageNo: '1'
        }, { headers: { 'Content-Type': 'application/json', 'Hkey': CONFIG.HKEY, 'User-Id': CONFIG.USER_ID }, timeout: 20000 });
        res.json({ success: true, list: response.data.data ? response.data.data.list : [] });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/issue', async (req, res) => {
    try {
        const { uniqNo } = req.body;
        const response = await axios.post('https://api.hyphen.im/in0004000948', {
            userId: CONFIG.HYPHEN_ID, userPw: CONFIG.HYPHEN_PW, userPwEnc: CONFIG.HYPHEN_PW,
            searchDiv: 'uniqNo', uniqNo: uniqNo, payDiv: '0', payNo: CONFIG.PAY_NO, payPw: CONFIG.PAY_PW, payPwEnc: CONFIG.PAY_PW,
            pdfHex: 'Y', xmlYn: 'N', display: '1', cmortCheck: '', tradeCheck: '', dupChk: '', excRegYn: '', closingYn: '', kindcls: '', kindclsYn: ''
        }, { headers: { 'Content-Type': 'application/json', 'Hkey': CONFIG.HKEY, 'User-Id': CONFIG.USER_ID }, timeout: 60000 });
        const result = response.data;
        if (result.data && result.data.pdfHexString) {
            res.json({ success: true, pdfHex: result.data.pdfHexString, info: result.data.outList || [], parsedArea: extractExclusiveArea(result.data.outList) });
        } else { res.json({ success: false, msg: "발급 실패" }); }
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/analyze', async (req, res) => {
    try {
        let { registryData, userInputs } = req.body;
        const correctArea = extractExclusiveArea(Array.isArray(registryData) ? registryData : []);
        if (correctArea) userInputs.area = correctArea;

        const prompt = `
            너는 대출 분석 기계다. 아래 [데이터]를 사용하여 반드시 시스템 지침에 정의된 [최종 리포트 템플릿] 양식 그대로 출력하라. 다른 말은 절대 하지 마라.

            [데이터]
            - 소유자: ${userInputs.ownerName || '박순호'} 님
            - 주소: ${userInputs.address}
            - KB시세: ${userInputs.kbPrice}만원
            - 전용면적: ${userInputs.area}㎡
            - 기대출: ${JSON.stringify(userInputs.loans)}
            - 등기부: ${JSON.stringify(registryData).substring(0, 5000)}
        `;

        const result = await model.generateContent(prompt);
        let finalAnalysis = result.response.text();
        if (finalAnalysis.includes('────────────────────────')) {
            finalAnalysis = finalAnalysis.substring(finalAnalysis.indexOf('────────────────────────'));
        }
        res.json({ success: true, analysis: finalAnalysis });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/share', (req, res) => {
    try {
        const { pdfHex, aiText, metaData } = req.body;
        const reportId = crypto.randomBytes(4).toString('hex');
        const savePath = path.join(REPORT_DIR, reportId);
        if (!fs.existsSync(savePath)) fs.mkdirSync(savePath);
        fs.writeFileSync(path.join(savePath, 'data.json'), JSON.stringify({ aiText, metaData, pdfHex }));
        if (pdfHex) fs.writeFileSync(path.join(savePath, 'doc.pdf'), Buffer.from(pdfHex, 'hex'));
        res.json({ success: true, reportId });
    } catch (e) { res.status(500).json({ success: false }); }
});

// 8. 서버 실행 (포트 설정 자동화)
const PORT = process.env.PORT || 8001;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 서버 가동 중 (Port: ${PORT})`);
});