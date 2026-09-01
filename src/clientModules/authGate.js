function isPublicPath(pathname) {
  return pathname === '/login.html' || pathname === '/login' || pathname === '/login/';
}

function redirectToLogin(pathname, search, hash) {
  const returnUrl = pathname + search + hash;
  try {
    sessionStorage.setItem('returnUrl', returnUrl);
  } catch (e) {}
  window.location.replace('/login.html?return=' + encodeURIComponent(returnUrl));
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

async function gate(location) {
  const pathname = location?.pathname || window.location.pathname;
  if (isPublicPath(pathname) || pathname.startsWith('/api/')) {
    return;
  }
  const session = await fetchSession();
  if (!session) {
    redirectToLogin(
      pathname,
      location?.search ?? window.location.search,
      location?.hash ?? window.location.hash,
    );
  }
}

if (typeof window !== 'undefined') {
  gate();
}

export function onRouteDidUpdate({location, previousLocation}) {
  if (previousLocation && location.pathname === previousLocation.pathname) {
    return;
  }
  gate(location);
}

export async function fetchAuthSession() {
  return fetchSession();
}
