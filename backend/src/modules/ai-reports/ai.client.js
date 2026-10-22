// เรียก LLM ผ่าน API รูปแบบ OpenAI-compatible (D-07): Gemini, Groq, OpenRouter, Ollama ใช้โค้ดเดียวกัน
// ค่าตั้งอ่านจาก .env ทุกครั้งที่เรียก ไม่ใช่ตอนโหลด module
// ลำดับที่ลอง: AI_MODEL → AI_FALLBACK_MODEL (ผู้ให้บริการหลัก) → AI_SECONDARY_MODEL (ผู้ให้บริการสำรอง เช่น Groq)

const DEFAULT_TIMEOUT_MS = 25000;

class AiUnavailableError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = 'AiUnavailableError';
    this.reason = reason; // 'AI_NOT_CONFIGURED' | 'AI_UNAVAILABLE'
  }
}

const withTrailingSlash = (url) => (url.endsWith('/') ? url : `${url}/`);

function readProviders() {
  const env = process.env;
  return [
    { baseUrl: env.AI_BASE_URL, apiKey: env.AI_API_KEY, models: [env.AI_MODEL, env.AI_FALLBACK_MODEL] },
    { baseUrl: env.AI_SECONDARY_BASE_URL, apiKey: env.AI_SECONDARY_API_KEY, models: [env.AI_SECONDARY_MODEL] },
  ]
    .map((provider) => ({ ...provider, models: [...new Set(provider.models.filter(Boolean))] }))
    // ผู้ให้บริการที่ตั้งค่าไม่ครบ (เช่น ยังไม่ได้ใส่ key ของ Groq) จะถูกข้าม
    .filter((provider) => provider.baseUrl && provider.apiKey && provider.models.length > 0)
    .map((provider) => ({ ...provider, baseUrl: withTrailingSlash(provider.baseUrl) }));
}

/**
 * ขอคำตอบแบบ JSON ตาม schema; ถ้าโมเดลล่ม/ช้า/ถูกจำกัดโควต้า จะลองโมเดลถัดไปตามลำดับ
 * @returns {Promise<{ content: string, model: string }>} content ยังเป็นข้อความ ผู้เรียกต้อง parse และตรวจเอง
 */
async function chatJson({ messages, schema }) {
  const providers = readProviders();
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  if (providers.length === 0) {
    throw new AiUnavailableError('AI_NOT_CONFIGURED', 'AI_BASE_URL, AI_API_KEY and AI_MODEL must be set in backend/.env');
  }

  const failures = [];
  // log ทุกครั้งที่โมเดลล้ม แม้โมเดลถัดไปจะตอบสำเร็จ เพื่อให้รู้ว่าทำไมต้องใช้โมเดลสำรอง
  const fail = (model, startedAt, detail) => {
    failures.push(`${model}: ${detail}`);
    console.warn(`AI model ${model} failed after ${Date.now() - startedAt} ms: ${detail}`);
  };

  for (const { baseUrl, apiKey, models } of providers) {
    for (const model of models) {
      const startedAt = Date.now();
      let response;
      try {
        response = await fetch(`${baseUrl}chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            temperature: 0,
            response_format: { type: 'json_schema', json_schema: { name: 'ai_report', schema } },
            messages,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        fail(model, startedAt, error.name === 'TimeoutError' ? `timeout after ${timeoutMs} ms` : error.message);
        continue;
      }

      if (!response.ok) {
        const detail = (await response.text()).replaceAll(apiKey, '***').replace(/\s+/g, ' ').slice(0, 200);
        fail(model, startedAt, `HTTP ${response.status} ${detail}`);
        // key ของผู้ให้บริการนี้ใช้ไม่ได้ ข้ามโมเดลที่เหลือของเจ้านี้ไปเจ้าถัดไป
        if (response.status === 401 || response.status === 403) break;
        continue;
      }

      let content;
      try {
        content = (await response.json()).choices?.[0]?.message?.content;
      } catch (error) {
        fail(model, startedAt, `response body is not JSON (${error.message})`);
        continue;
      }
      if (typeof content !== 'string' || content.trim() === '') {
        fail(model, startedAt, 'response has no message content');
        continue;
      }
      return { content, model };
    }
  }

  throw new AiUnavailableError('AI_UNAVAILABLE', `All AI models failed: ${failures.join(' | ')}`);
}

module.exports = { chatJson, AiUnavailableError };
