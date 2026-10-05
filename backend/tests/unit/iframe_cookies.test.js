const { cookieConfig, getCookieOptions } = require('../../config/cookies');
const { setRefreshCookie, clearRefreshCookie } = require('../../services/authService');

describe('Iframe and Partitioned Cookie Configuration', () => {
  test('cookieConfig specifies correct defaultCookieAttributes', () => {
    expect(cookieConfig).toBeDefined();
    expect(cookieConfig.advanced).toBeDefined();
    expect(cookieConfig.advanced.defaultCookieAttributes).toEqual({
      sameSite: 'none',
      secure: true,
      partitioned: true,
    });
  });

  test('getCookieOptions merges overrides with partitioned attributes', () => {
    const options = getCookieOptions({ httpOnly: true, path: '/api/auth' });
    expect(options).toEqual({
      sameSite: 'none',
      secure: true,
      partitioned: true,
      httpOnly: true,
      path: '/api/auth',
    });
  });

  test('setRefreshCookie calls res.cookie with SameSite=None, Secure, Partitioned', () => {
    const res = {
      cookie: jest.fn(),
    };
    setRefreshCookie(res, 'mock-refresh-token-xyz');

    expect(res.cookie).toHaveBeenCalledTimes(1);
    const [name, val, opts] = res.cookie.mock.calls[0];
    expect(name).toBe('refreshToken');
    expect(val).toBe('mock-refresh-token-xyz');
    expect(opts.sameSite).toBe('none');
    expect(opts.secure).toBe(true);
    expect(opts.partitioned).toBe(true);
    expect(opts.httpOnly).toBe(true);
    expect(opts.path).toBe('/api/auth');
  });

  test('clearRefreshCookie calls res.clearCookie with SameSite=None, Secure, Partitioned', () => {
    const res = {
      clearCookie: jest.fn(),
    };
    clearRefreshCookie(res);

    expect(res.clearCookie).toHaveBeenCalledTimes(1);
    const [name, opts] = res.clearCookie.mock.calls[0];
    expect(name).toBe('refreshToken');
    expect(opts.sameSite).toBe('none');
    expect(opts.secure).toBe(true);
    expect(opts.partitioned).toBe(true);
    expect(opts.httpOnly).toBe(true);
    expect(opts.path).toBe('/api/auth');
  });
});
