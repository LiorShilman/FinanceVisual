const BASE_URL = (process.env.RISEUP_API_BASE || 'https://input.riseup.co.il').replace(/\/+$/, '');

async function riseupGet(path, pat, searchParams) {
  const url = new URL(BASE_URL + path);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${pat}` },
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    const err = new Error(`RiseUp API ${res.status}: ${body}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

function getBudget(pat, date = 'current') {
  return riseupGet(`/api/external/budget/${encodeURIComponent(date)}`, pat);
}

function getBudgetHistory(pat, date, numMonthsBack) {
  return riseupGet(`/api/external/budget/${encodeURIComponent(date)}/${encodeURIComponent(numMonthsBack)}`, pat);
}

function getTransactions(pat, { cashflowMonth, transactionDate, businessName }) {
  return riseupGet('/api/external/transactions', pat, { cashflowMonth, transactionDate, businessName });
}

module.exports = { getBudget, getBudgetHistory, getTransactions };
