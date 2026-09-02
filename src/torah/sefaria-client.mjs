const BASE = 'https://www.sefaria.org';

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  if (!res.ok) throw new Error(`Sefaria ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getText(ref, { version = 'primary' } = {}) {
  const url = new URL(`${BASE}/api/v3/texts/${encodeURIComponent(ref)}`);
  url.searchParams.set('version', version);
  url.searchParams.set('return_format', 'text_only');
  return jsonFetch(url);
}

export async function searchText(query, {
  size = 8,
  exact = true,
  filters = []
} = {}) {
  return jsonFetch(`${BASE}/api/search-wrapper`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'text',
      query,
      field: exact ? 'exact' : 'naive_lemmatizer',
      slop: exact ? 0 : 10,
      size,
      start: 0,
      filters,
      filter_fields: filters.map(() => 'path'),
      source_proj: true,
      sort_method: 'score',
      sort_fields: ['pagesheetrank']
    })
  });
}

export async function findBestSource(query, scope = 'all') {
  const scopeFilters = {
    tanakh: ['Tanakh'],
    bavli: ['Talmud/Bavli'],
    rambam: ['Halakhah/Mishneh Torah'],
    shulchanArukh: ['Halakhah/Shulchan Arukh'],
    all: []
  };

  const filters = scopeFilters[scope] ?? [];
  let result = await searchText(query, { exact: true, filters });
  if (!result?.hits?.hits?.length) {
    result = await searchText(query, { exact: false, filters });
  }
  return result;
}
