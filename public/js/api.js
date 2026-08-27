function apiCall(endpoint, opts = {}) {
    const token = localStorage.getItem('dcf_token');
    return fetch(API + endpoint, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
            ...opts.headers
        }
    }).then(r => r.json()).catch(() => ({ error: '网络错误' }));
}
