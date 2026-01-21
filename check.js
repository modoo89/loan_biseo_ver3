const { GoogleGenerativeAI } = require("@google/generative-ai");

// ★ server.js에 넣었던 그 긴 API 키를 여기에 붙여넣으세요!
const API_KEY = 'AIzaSy.........................'; 

async function checkAvailableModels() {
    const genAI = new GoogleGenerativeAI(API_KEY);
    console.log("🔍 무료로 사용 가능한 모델을 찾는 중...");

    try {
        // 모델 목록 조회 시도 (2026년 라이브러리 호환성 고려)
        // 만약 listModels()가 안 먹히면 특정 모델 하나를 찔러봅니다.
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        const result = await model.generateContent("Test");
        console.log("✅ 성공! 'gemini-1.5-flash-latest' 모델이 살아있습니다.");
    } catch (error) {
        console.log("---------------------------------------------------");
        console.log("❌ 오류 메시지 분석:");
        console.log(error.message);
        console.log("---------------------------------------------------");
        console.log("💡 해결책: 위 오류에 'supported models' 리스트가 보인다면 그중 하나를 쓰면 됩니다.");
    }
}

checkAvailableModels();