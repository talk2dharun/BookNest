export const REFRESH_COOKIE_NAME = 'refresh_token';
// Cookie is scoped to /auth so JavaScript on other paths never sees it, and the
// browser only sends it to register/login/refresh/logout.
export const REFRESH_COOKIE_PATH = '/auth';
