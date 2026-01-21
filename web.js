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

// 3. 설정 정보 (HKey 및 하이픈 계정)
const CONFIG = {
    HKEY: '130e008d28511f21',
    USER_ID: 'snow89',
    HYPHEN_ID: 'snow89',
    HYPHEN_PW: '10dnjf2djr!',
    PAY_NO: 'V37642074050',
    PAY_PW: '10dnjf',
    GEMINI_API_KEY: 'AIzaSyBQA5y7Ttpck8kQPiezs7Ti6geQ-yDxVAM', 
};

// 4. [중요] 선언 순서: genAI를 먼저 선언해야 에러가 나지 않습니다.
const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);

// 5. 시스템 프롬프트 (템플릿 및 계산 로직 고정)
const DAMBAEK_PROMPT = `
# [담백스퀘어(주) 대출비서] 전용 출력 기계

## 1. 동작 원칙
- 너는 아래 제공된 데이터를 사용하여 오직 [최종 리포트 템플릿]의 빈칸({ })만 채우는 로봇이다.
- 임의의 제목(예: 대출 분석 보고서)이나 인사말, 분석 의견은 절대 추가하지 마라.
- 시작은 반드시 ──────────────────────── 로 하라.

## 2. 계산 로직
- 방공제액: 서울(5,500), 과밀(4,800), 광역시(2,800), 기타(2,500).
- Case 1 한도: MIN(시세 * 80%, 60,000).
- Case 2 한도: 규제지역(15억 이하: 시세*40%, Max 6억 / 15-25억: 4억 / 25억 초과: 2억).
`;

// 6. 모델 설정 (창의성 0 고정)
const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: DAMBAEK_PROMPT,
    generationConfig: {
        temperature: 0, 
        topP: 0.1,
    }
});

// 7. 유틸리티 함수
function extractExclusiveArea(outList) {
    if (!outList || !Array.isArray(outList)) return null;
    const cleanText = outList.map(item => JSON.stringify(item)).join('').replace(/\\n/g, '').replace(/\s/g, '');
    const sections = cleanText.split('전유부분');
    if (sections.length < 2) return null;
    const match = sections[1].match(/(\d+\.\d+)/);
    return match ? match[0] : null;
}

// 8. API 라우트
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

// [최종 최적화] AI 분석 및 템플릿 강제 출력 라우트
app.post('/api/analyze', async (req, res) => {
    try {
        let { registryData, userInputs } = req.body;
        const correctArea = extractExclusiveArea(Array.isArray(registryData) ? registryData : []);
        if (correctArea) userInputs.area = correctArea;

        // 템플릿 본문을 프롬프트에 직접 포함하여 AI의 뇌를 고정합니다.
        const prompt = `
        사용자가 입력한 아래 [데이터]를 바탕으로, 반드시 아래 [리포트 양식]의 빈칸만 채워서 텍스트 전체를 출력하라. 
        설명이나 인사말은 일절 금지한다.

        [데이터]
        소유자명: ${userInputs.ownerName || '박순호'}
        주소: ${userInputs.address || '정보 없음'}
        KB시세: ${userInputs.kbPrice}만원
        전용면적: ${userInputs.area}㎡
        기대출 내역: ${JSON.stringify(userInputs.loans)}
        등기부 정보: ${JSON.stringify(registryData).substring(0, 5000)}

        [리포트 양식]
        ──────────────────────── 
        🏢 **담백스퀘어(주) 대출비서 리포트** ──────────────────────── 

        📍 **1. 기본 정보**
        소유자: **{소유자명}** 님
        주소: {주소}
        전용면적: {전용면적}㎡
        KB시세: **{KB시세}만원**

        ──────────────────────── 

        💳 **2. 기대출 및 자산 평가**
        {기대출 목록 나열}

        총 원금합계: **{원금합계}만원**
        총 채권최고액 합계: **{채권합계}만원**
        순자산: **{순자산}만원** (시세-원금)
        대출비율(LTV): **{LTV}%**

        **[대출 LTV 금액별 예상표]**
        ㅁ 상호금융 (방공제 적용)
        LTV 80%: {시세80%}-방공제 = **{결과}만원**
        LTV 85%: {시세85%}-방공제 = **{결과}만원**

        ㅁ 저축은행/캐피탈 (방공제 미적용)
        LTV 80%: **{시세80%}만원**
        LTV 90%: **{시세90%}만원**

        ──────────────────────── 

        📊 **3. 대출 한도 및 월납입금 (예상)**

        **[케이스1] 생애최초 매매잔금**
        한도: **{한도}만원** (LTV 80%, 최대 6억)
        1금융: 금리 4.3%~ / 월 원리금 {월액}만원
        2금융: 금리 4.0%~ / 월 원리금 {월액}만원

        **[케이스2] 일반 매매잔금**
        한도: **{한도}만원** (지역별 규제 적용)
        1금융: 금리 4.3%~ / 필요소득 약 {소득}만원
        2금융: 금리 4.0%~ / 필요소득 약 {소득}만원

        **[케이스3] 전세퇴거자금**
        ① 1주택자 (LTV {LTV}%): **{한도}만원**
        ② 다주택자 (LTV {LTV}%): **{한도}만원**

        **[케이스4] 사업자 담보대출 (후순위)**
        ㅁ 상호금융 (LTV 80%-방공제): **{한도}만원**
        ㅁ 저축/캐피탈 (LTV 90%): **{한도}만원**

        ──────────────────────── 

        ➕ **[케이스5] 후순위 추가 대출**
        상호금융: **{한도}만원** / 저축은행: **{한도}만원**

        ──────────────────────── 

        🔄 **[케이스6] 통대환 (갈아타기)**
        상호금융: 최대 **{한도}만원** / 여유자금 **{가용}만원**

        ──────────────────────── 

        ⚠️ **안내사항**
        본 리포트는 KB시세를 기반으로 한 예상치이며 실제 한도는 달라질 수 있습니다.

        📞 **상담문의: 박순호 대표 (010-3950-6886)**
        ────────────────────────
        `;

        const result = await model.generateContent(prompt);
        let finalAnalysis = result.response.text();
        
        // ──────────────────────── 이전의 쓸데없는 말을 잘라내는 안전장치
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

const PORT = process.env.PORT || 8001;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 대출비서 Pro 가동 (Port: ${PORT})`);
});