const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();
const MODEL = 'claude-opus-4-8';

function buildSystemPrompt({ month, context }) {
  const { income, expense, net, categories = [], transactions = [] } = context;

  const categoryLines = categories.map((c) => `- ${c.label}: ${Math.round(c.total)} ש"ח`).join('\n');
  const txLines = transactions
    .map((t) => `${t.date} | ${t.business} | ${t.category || 'ללא קטגוריה'} | ${t.isIncome ? '+' : '-'}${Math.round(t.amount)} ש"ח`)
    .join('\n');

  return `את/ה עוזר/ת פיננסי/ת שעונה על שאלות לגבי התקציב האישי של המשתמש/ת ב-RiseUp, עבור חודש ${month}.

השתמש/י אך ורק בנתונים שמופיעים למטה כדי לענות. אם שאלה דורשת מידע שלא מופיע כאן, אמר/י זאת בבירור במקום לנחש. ענה/י תמיד בעברית, בקצרה ולעניין, וכתוב/י סכומים בש"ח.

## סיכום החודש
הכנסות: ${Math.round(income)} ש"ח
הוצאות: ${Math.round(expense)} ש"ח
מאזן (הכנסות פחות הוצאות): ${Math.round(net)} ש"ח

## הוצאות לפי קטגוריה
${categoryLines || '(אין נתונים)'}

## תנועות
${txLines || '(אין נתונים)'}`;
}

async function streamChatAnswer({ month, context, messages }) {
  const system = buildSystemPrompt({ month, context });

  return client.messages.stream({
    model: MODEL,
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
}

module.exports = { streamChatAnswer };
