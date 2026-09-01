function isPublicPath(pathname) {
    return pathname === '/login.html' || pathname === '/login' || pathname === '/login/';
}

function safeReturnUrl(raw) {
    if (!raw || raw.charAt(0) !== '/' || raw.indexOf('//') === 0 || raw.indexOf('://') !== -1) {
        return '/';
    }
    if (raw === '/login' || raw.indexOf('/login.html') === 0 || raw.indexOf('/login?') === 0) {
        return '/';
    }
    return raw;
}

async function fetchSession() {
    try {
        const response = await fetch('/api/auth/session', {
            method: 'GET',
            credentials: 'include',
        });
        if (!response.ok) {
            return null;
        }
        const data = await response.json();
        return data.authenticated ? data : null;
    } catch (e) {
        return null;
    }
}

async function checkAuth() {
    if (isPublicPath(window.location.pathname)) {
        return true;
    }
    const session = await fetchSession();
    if (!session) {
        const returnUrl = window.location.pathname + window.location.search + window.location.hash;
        try { sessionStorage.setItem('returnUrl', returnUrl); } catch (e) {}
        window.location.replace('/login.html?return=' + encodeURIComponent(returnUrl));
        return false;
    }
    return true;
}

async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {}
    window.location.href = '/login.html';
}

if (!isPublicPath(window.location.pathname)) {
    checkAuth();
}

window.authSession = { fetchSession, logout, checkAuth, safeReturnUrl };
