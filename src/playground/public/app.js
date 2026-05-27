const dom = {
    endpointSearch: document.getElementById('endpointSearch'),
    endpointList: document.getElementById('endpointList'),
    method: document.getElementById('method'),
    path: document.getElementById('path'),
    apiKey: document.getElementById('apiKey'),
    origin: document.getElementById('origin'),
    userAgent: document.getElementById('userAgent'),
    sendBtn: document.getElementById('sendBtn'),
    copyCurl: document.getElementById('copyCurl'),
    clearResponse: document.getElementById('clearResponse'),
    status: document.getElementById('status'),
    time: document.getElementById('time'),
    size: document.getElementById('size'),
    requestId: document.getElementById('requestId'),
    sourceInfo: document.getElementById('sourceInfo'),
    response: document.getElementById('response')
};

const state = {
    endpoints: [],
    activePath: '/anime/home'
};

const methodTone = (method = 'GET') => `method-${String(method).toLowerCase()}`;

const escapeHtml = (value) =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

const renderEndpoints = (items) => {
    const groups = new Map();
    for (const item of items) {
        if (!groups.has(item.group)) groups.set(item.group, []);
        groups.get(item.group).push(item);
    }

    const html = [];
    for (const [group, list] of groups.entries()) {
        html.push(`<div class="endpoint-group-label">${escapeHtml(group)}</div>`);
        for (const item of list) {
            const isActive = item.path === state.activePath ? 'active' : '';
            const toneClass = methodTone(item.method);
            html.push(`
        <button class="endpoint-item ${isActive}" data-method="${escapeHtml(item.method)}" data-path="${escapeHtml(item.path)}" type="button" title="${escapeHtml(item.path)}">
          <div class="endpoint-item-top">
            <span class="endpoint-method ${toneClass}">${escapeHtml(item.method)}</span>
            <span class="endpoint-name">${escapeHtml(item.name)}</span>
          </div>
          <span class="endpoint-path">${escapeHtml(item.path)}</span>
        </button>
      `);
        }
    }
    dom.endpointList.innerHTML = html.join('');
};

const setStatusClass = (statusCode) => {
    dom.status.classList.remove('status-ok', 'status-warn', 'status-err');
    if (!statusCode) return;
    if (statusCode < 300) dom.status.classList.add('status-ok');
    else if (statusCode < 500) dom.status.classList.add('status-warn');
    else dom.status.classList.add('status-err');
};

const updateResponseBox = (data) => {
    const formatted = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    dom.response.textContent = formatted;
};

const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }
    return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};

const buildCurlCommand = () => {
    const method = dom.method.value;
    const path = dom.path.value.trim();
    const headers = [];
    if (dom.apiKey.value.trim()) headers.push(`-H "x-api-key: ${dom.apiKey.value.trim()}"`);
    if (dom.origin.value.trim()) headers.push(`-H "Origin: ${dom.origin.value.trim()}"`);
    if (dom.userAgent.value.trim()) headers.push(`-H "User-Agent: ${dom.userAgent.value.trim()}"`);
    return `curl -X ${method} ${headers.join(' ')} "${window.location.origin}${path}"`;
};

const setLoading = (loading) => {
    dom.sendBtn.disabled = loading;
    dom.sendBtn.textContent = loading ? 'Sending...' : 'Send';
};

const syncMethodSelectTone = () => {
    dom.method.classList.remove('method-get', 'method-post', 'method-put', 'method-patch', 'method-delete');
    dom.method.classList.add(methodTone(dom.method.value));
};

const sendRequest = async () => {
    const method = dom.method.value;
    const path = dom.path.value.trim();
    if (!path.startsWith('/')) {
        updateResponseBox({ success: false, error: 'Path harus dimulai dengan /' });
        return;
    }

    const headers = { Accept: 'application/json' };
    if (dom.apiKey.value.trim()) headers['x-api-key'] = dom.apiKey.value.trim();

    const startedAt = performance.now();
    setLoading(true);
    dom.sourceInfo.textContent = '';
    dom.requestId.textContent = '-';

    try {
        const response = await fetch(path, { method, headers });
        const rawText = await response.text();
        const endedAt = performance.now();
        const duration = Math.round(endedAt - startedAt);
        const requestId = response.headers.get('x-request-id') || '-';

        let parsed;
        try {
            parsed = JSON.parse(rawText);
        } catch {
            parsed = rawText;
        }

        dom.status.textContent = `${response.status} ${response.statusText}`;
        dom.time.textContent = `${duration} ms`;
        dom.size.textContent = formatBytes(new Blob([rawText]).size);
        dom.requestId.textContent = requestId;
        setStatusClass(response.status);

        if (parsed && typeof parsed === 'object') {
            const source = parsed.source || parsed.creator || parsed.status || '';
            if (source) dom.sourceInfo.textContent = `Meta: ${source}`;
        }

        updateResponseBox(parsed);
    } catch (error) {
        const endedAt = performance.now();
        dom.status.textContent = 'Network Error';
        dom.time.textContent = `${Math.round(endedAt - startedAt)} ms`;
        dom.size.textContent = '-';
        setStatusClass(500);
        updateResponseBox({
            success: false,
            error: error?.message || 'Gagal mengirim request'
        });
    } finally {
        setLoading(false);
    }
};

const loadEndpoints = async () => {
    try {
        const response = await fetch('/playground/endpoints.json');
        const data = await response.json();
        state.endpoints = Array.isArray(data.endpoints) ? data.endpoints : [];
        renderEndpoints(state.endpoints);
    } catch {
        state.endpoints = [];
        dom.endpointList.innerHTML = '<small>Gagal memuat endpoint list.</small>';
    }
};

dom.endpointList.addEventListener('click', (event) => {
    const button = event.target.closest('.endpoint-item');
    if (!button) return;
    dom.method.value = button.dataset.method || 'GET';
    dom.path.value = button.dataset.path || '/anime/home';
    state.activePath = dom.path.value;
    syncMethodSelectTone();
    renderEndpoints(state.endpoints);
});

dom.endpointSearch.addEventListener('input', (event) => {
    const keyword = event.target.value.trim().toLowerCase();
    if (!keyword) {
        renderEndpoints(state.endpoints);
        return;
    }
    const filtered = state.endpoints.filter((item) =>
        `${item.group} ${item.name} ${item.path}`.toLowerCase().includes(keyword)
    );
    renderEndpoints(filtered);
});

dom.sendBtn.addEventListener('click', sendRequest);
dom.method.addEventListener('change', syncMethodSelectTone);
dom.clearResponse.addEventListener('click', () => {
    dom.status.textContent = '-';
    dom.time.textContent = '-';
    dom.size.textContent = '-';
    dom.requestId.textContent = '-';
    dom.sourceInfo.textContent = '';
    dom.status.classList.remove('status-ok', 'status-warn', 'status-err');
    updateResponseBox({});
});

dom.copyCurl.addEventListener('click', async () => {
    const curl = buildCurlCommand();
    try {
        await navigator.clipboard.writeText(curl);
        dom.copyCurl.textContent = 'Copied';
        setTimeout(() => {
            dom.copyCurl.textContent = 'Copy cURL';
        }, 1200);
    } catch {
        dom.copyCurl.textContent = 'Failed';
        setTimeout(() => {
            dom.copyCurl.textContent = 'Copy cURL';
        }, 1200);
    }
});

dom.path.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        sendRequest();
    }
});

document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        sendRequest();
    }
});

updateResponseBox({});
loadEndpoints();
syncMethodSelectTone();
