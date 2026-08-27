const OpenAI = require('openai');

// the frontier/most-capable model in OpenAI's current lineup (per explicit user request — "most
// advanced, not old"), not the budget-tier gpt-4o-mini this started on.
const MODEL = 'gpt-5.6-sol';

// Turns a compact financial summary (see FinanceVisual's own domain/insights.ts for the exact
// shape) into a Hebrew-language data block — the model only ever sees this summary, never raw
// per-transaction data, keeping the payload small and the household's data need-to-know. Shared
// between the automatic insights prompt and the free-question prompt below, so both ground
// themselves in the exact same numbers.
function renderSummary(summary) {
  const {
    netWorth,
    liquidNetWorth,
    monthlyIncome,
    monthlyExpenses,
    budgetSplit,
    emergencyFundMonths,
    goals = [],
    insurance = [],
    debts = [],
    currency = 'ils',
  } = summary;

  const fmt = (n) => `${Math.round(n).toLocaleString('he-IL')} ${currency === 'usd' ? '$' : 'ש"ח'}`;

  const goalLines = goals.map((g) => `- ${g.name}: ${Math.round(g.progressPct)}% מהיעד`).join('\n');
  // just the name/type when there's no computable coverage ratio (health/vehicle/other insurance
  // types don't have an "income years" notion at all — see domain/insights.ts) — not a hedge like
  // "no coverage data", which the model kept misreading as "may not actually exist" even though
  // the policy is right there, named, in the list.
  const insuranceLines = insurance
    .map((i) => `- ${i.name} (${i.type})${i.coverageYears != null ? `: ${i.coverageYears.toFixed(1)} שנות הכנסה כיסוי` : ''}`)
    .join('\n');
  const debtLines = debts.map((d) => `- ${d.name}: החזר חודשי ${fmt(d.monthlyPayment)} (${Math.round(d.burdenPct)}% מההכנסה)`).join('\n');

  return `## סיכום
הון עצמי: ${fmt(netWorth)}
הון עצמי נזיל (ללא פנסיה): ${fmt(liquidNetWorth)}
הכנסה חודשית: ${fmt(monthlyIncome)}
הוצאות חודשיות: ${fmt(monthlyExpenses)}
פילוח תקציב (מהמשפחה הזו בפועל): צרכים ${Math.round(budgetSplit.needsPct)}% · רצונות ${Math.round(budgetSplit.wantsPct)}% · חיסכון ${Math.round(budgetSplit.savingsPct)}%${budgetSplit.unallocatedPct > 0 ? ` · לא מוקצה ${Math.round(budgetSplit.unallocatedPct)}%` : ''}
קרן חירום: ${emergencyFundMonths != null ? `${emergencyFundMonths.toFixed(1)} חודשי כיסוי בפועל` : 'לא הוגדרה (אין מספיק נתוני הוצאות חיוניות כדי לחשב)'}

## יעדים
${goalLines || '(אין יעדים פעילים)'}

## ביטוחים
${insuranceLines || '(אין ביטוחים רשומים)'}

## חובות
${debtLines || '(אין חובות רשומים)'}`;
}

// Itemized per-entity list — deliberately NOT included in the automatic-insights prompt (which
// stays terse/aggregate-only, matching its fixed 2-3-bullet shape), only in the free-question one
// below. Without this, a question like "כמה יש לי בקרן ההשתלמות" or "מה ההוצאה הכי גדולה שלי" has
// no way to be answered — the aggregate summary above only has category-level totals, not
// individual accounts.
function renderEntityList(summary) {
  const { entities = [], currency = 'ils' } = summary;
  if (entities.length === 0) return '(אין ישויות רשומות)';
  const fmt = (n) => `${Math.round(n).toLocaleString('he-IL')} ${currency === 'usd' ? '$' : 'ש"ח'}`;
  return entities.map((e) => `- ${e.name} (${e.category}): ${fmt(e.amount)}`).join('\n');
}

const GROUNDING_RULES = `כללים מחייבים:
1. כל תשובה חייבת להתייחס לפחות למספר אחד ממשי מהנתונים למטה (סכום בש"ח או אחוז) כשרלוונטי — לא ניסוח כללי בלי מספר.
2. אסור בהחלט להמציא מספר, יעד, או המלצת-אצבע (כמו "3-6 חודשים" או "10%") שלא ניתן במפורש למטה. אם שדה מסומן "לא הוגדרה"/"(אין נתונים)", אפשר לציין שאין עליו נתון, אבל אסור לנחש ערך במקומו.
3. האחוזים בפילוח התקציב הם המספרים האמיתיים של המשפחה הזו — לא אחוזי המופת של כלל 50/30/20 הכללי. אל תחליף/י אותם באחוזים "סטנדרטיים".
4. פריט שמופיע ברשימה (יעד/ביטוח/חוב) קיים בוודאות — אל תרמז/י שהוא "אולי לא קיים" רק כי חסר לו נתון משני אחד (כמו יחס כיסוי).`;

async function generateInsights(apiKey, summary) {
  const client = new OpenAI({ apiKey });
  const prompt = `את/ה יועץ/ת פיננסי/ת אישי/ת. קיבלת תקציר מצב כלכלי של משפחה, ועליך להפיק בדיוק 2 עד 3 תובנות קצרות, ספציפיות וישימות בעברית. כל תובנה עד משפט וחצי.

${GROUNDING_RULES}

${renderSummary(summary)}

החזר/י JSON בלבד בפורמט: {"insights": ["...", "...", "..."]}`;

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    // newer models (including this one) reject the legacy `max_tokens` param outright, and a
    // reasoning-capable model's own invisible reasoning tokens count against this budget too —
    // 500 was already tight for gpt-4o-mini's plain completions, let alone reasoning overhead.
    max_completion_tokens: 1200,
  });
  const raw = completion.choices[0]?.message?.content || '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('OpenAI returned invalid JSON'), { status: 502 });
  }
  const insights = Array.isArray(parsed.insights) ? parsed.insights.filter((s) => typeof s === 'string' && s.trim() !== '') : [];
  if (insights.length === 0) {
    throw Object.assign(new Error('OpenAI returned no insights'), { status: 502 });
  }
  return insights.slice(0, 3);
}

// Free-form Q&A on the same summary — "כמה עוד עד שאני מגיע ליעד X", "האם הביטוח שלי מספיק" —
// answered directly, not forced into the insights' own 2-3-bullet JSON shape.
async function answerQuestion(apiKey, summary, question) {
  const client = new OpenAI({ apiKey });
  const system = `את/ה יועץ/ת פיננסי/ת אישי/ת שעונה על שאלה חופשית לגבי המצב הכלכלי של המשפחה. ענה/י בעברית, בקצרה ולעניין (עד כמה משפטים).

${GROUNDING_RULES}
5. אם השאלה דורשת מידע שלא מופיע למטה, אמר/י זאת בבירור במקום לנחש.

${renderSummary(summary)}

## כל הישויות (חשבונות/נכסים/הוצאות בודדים)
${renderEntityList(summary)}`;

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: question },
    ],
    max_completion_tokens: 1200,
  });
  const answer = completion.choices[0]?.message?.content?.trim();
  if (!answer) {
    throw Object.assign(new Error('OpenAI returned no answer'), { status: 502 });
  }
  return answer;
}

module.exports = { generateInsights, answerQuestion };
