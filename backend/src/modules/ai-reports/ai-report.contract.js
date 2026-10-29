// สัญญา AI Input/Output ตาม SRS 3.4 และ BR-02 แยกเป็น pure function เพื่อ test ได้โดยไม่ต้องเรียก AI จริง
const { validateSchema } = require('./schema.validator');

const SUGGESTION_COUNT = 3;

const SYSTEM_PROMPT = [
  'You are a shop performance advisor for small Thai shops.',
  'Input: aggregated weekly or monthly metrics of one shop, the previous period for comparison, and the promotion templates the shop may use.',
  'Write summary, problem, possible_causes and every reason in Thai, short and plain, using Thai words for metric names.',
  'Only use numbers that appear in the input. Do not claim that a promotion will certainly increase sales.',
  'When you quote a number, copy it exactly or round it correctly (30.76 becomes 31 or 30.8, never 30).',
  'possible_causes must come only from what the metrics show (for example fewer new customers or fewer orders); do not invent outside reasons such as competitors, weather or marketing.',
  `Return exactly ${SUGGESTION_COUNT} suggestions with rank 1, 2 and 3 and three different template_id values taken from allowed_promotion_templates.`,
  'Rank 1 must be the template whose target KPI addresses the biggest problem in the metrics.',
  'parameters must follow that template parameter_schema exactly: include every required key, respect minimum and maximum, and add no other keys.',
  'Choose parameter values a small shop owner would really offer, as round numbers (for example a 10 percent discount, or a minimum spend of 150 or 200 baht near the current AOV). Never copy metric values or percent changes from the input into parameters.',
  'target_kpi is a short snake_case KPI name such as new_customer_conversion, repeat_rate, aov or purchase_frequency.',
].join('\n');

// ส่งเฉพาะตัวเลขสรุประดับร้าน ไม่มี shop_id, ชื่อร้าน, email หรือรายการรายบุคคล (NFR-04)
function buildAiPayload(dashboard, templates) {
  return {
    period: dashboard.period,
    metrics: dashboard.metrics,
    comparison: dashboard.comparison,
    change_percent: dashboard.change_percent,
    allowed_promotion_templates: templates.map((t) => ({
      template_id: t.template_id,
      code: t.code,
      name: t.name,
      description: t.description,
      target_kpi: t.target_kpi,
      parameter_schema: t.parameter_schema,
    })),
  };
}

function buildMessages(payload) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify(payload) },
  ];
}

function buildRetryMessages(messages, previousContent, errors) {
  return [
    ...messages,
    { role: 'assistant', content: previousContent },
    {
      role: 'user',
      content: `Your previous answer failed validation:\n- ${errors.join('\n- ')}\nReturn the corrected JSON only.`,
    },
  ];
}

// schema ที่บอกโมเดลให้ตอบเป็น JSON: parameters รวม key จากทุก template ไว้ เพราะ structured output
// ของแต่ละผู้ให้บริการรองรับ anyOf ไม่เท่ากัน ความถูกต้องรายตัวตรวจด้วย validateAiOutput อีกชั้น
function buildResponseSchema(templates) {
  const parameterProperties = {};
  for (const template of templates) {
    for (const [key, property] of Object.entries(template.parameter_schema.properties || {})) {
      if (parameterProperties[key]) continue;
      parameterProperties[key] = property.items ? { type: property.type, items: { type: property.items.type } } : { type: property.type };
    }
  }
  return {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      problem: { type: 'string' },
      possible_causes: { type: 'array', items: { type: 'string' } },
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            rank: { type: 'integer' },
            template_id: { type: 'integer' },
            parameters: { type: 'object', properties: parameterProperties },
            reason: { type: 'string' },
            target_kpi: { type: 'string' },
          },
          required: ['rank', 'template_id', 'parameters', 'reason', 'target_kpi'],
        },
      },
    },
    required: ['summary', 'problem', 'possible_causes', 'suggestions'],
  };
}

const OUTPUT_SHAPE = {
  type: 'object',
  required: ['summary', 'problem', 'possible_causes', 'suggestions'],
  properties: {
    summary: { type: 'string' },
    problem: { type: 'string' },
    possible_causes: { type: 'array', items: { type: 'string' } },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['rank', 'template_id', 'parameters', 'reason', 'target_kpi'],
        properties: {
          rank: { type: 'integer' },
          template_id: { type: 'integer' },
          parameters: { type: 'object' },
          reason: { type: 'string' },
          target_kpi: { type: 'string' },
        },
      },
    },
  },
};

const stripCodeFence = (text) => text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

/**
 * ตรวจคำตอบของ AI ตาม BR-02 และ parameter_schema ของแต่ละ template
 * @returns {{ errors: string[], report?: { summary, problem, possible_causes, suggestions } }}
 */
function validateAiOutput(content, templates) {
  let output;
  try {
    output = JSON.parse(stripCodeFence(content));
  } catch (error) {
    return { errors: [`response is not valid JSON (${error.message})`] };
  }

  const errors = validateSchema(output, OUTPUT_SHAPE);
  if (errors.length > 0) return { errors };

  for (const key of ['summary', 'problem']) {
    if (output[key].trim() === '') errors.push(`$.${key} must not be empty`);
  }
  if (output.possible_causes.filter((cause) => cause.trim() !== '').length === 0) {
    errors.push('$.possible_causes must contain at least one cause');
  }

  const { suggestions } = output;
  if (suggestions.length !== SUGGESTION_COUNT) {
    errors.push(`$.suggestions must contain exactly ${SUGGESTION_COUNT} items, got ${suggestions.length}`);
  }
  const ranks = suggestions.map((s) => s.rank).sort((a, b) => a - b);
  if (suggestions.length === SUGGESTION_COUNT && ranks.join(',') !== '1,2,3') {
    errors.push(`$.suggestions ranks must be 1, 2 and 3 without duplicates, got ${ranks.join(', ')}`);
  }
  const templateIds = suggestions.map((s) => s.template_id);
  if (new Set(templateIds).size !== templateIds.length) {
    errors.push(`$.suggestions must use different template_id values, got ${templateIds.join(', ')}`);
  }

  const templatesById = new Map(templates.map((t) => [t.template_id, t]));
  suggestions.forEach((suggestion, index) => {
    const path = `$.suggestions[${index}]`;
    const template = templatesById.get(suggestion.template_id);
    if (!template) {
      errors.push(`${path}.template_id ${suggestion.template_id} is not an allowed active template`);
      return;
    }
    // ห้าม key ที่ template ไม่ได้กำหนด เพื่อไม่ให้แคมเปญได้ parameter ที่ไม่มีความหมาย
    const strictSchema = { ...template.parameter_schema, additionalProperties: false };
    errors.push(...validateSchema(suggestion.parameters, strictSchema, `${path}.parameters (${template.code})`));
    for (const key of ['reason', 'target_kpi']) {
      if (suggestion[key].trim() === '') errors.push(`${path}.${key} must not be empty`);
    }
  });

  if (errors.length > 0) return { errors };
  return {
    errors: [],
    report: {
      summary: output.summary.trim(),
      problem: output.problem.trim(),
      possible_causes: output.possible_causes.map((c) => c.trim()).filter(Boolean),
      suggestions: [...suggestions].sort((a, b) => a.rank - b.rank),
    },
  };
}

module.exports = {
  buildAiPayload,
  buildMessages,
  buildRetryMessages,
  buildResponseSchema,
  validateAiOutput,
  SUGGESTION_COUNT,
};
