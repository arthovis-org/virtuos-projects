/**
 * What makes every website work on the configurator's screens: sites tell browsers not to show
 * them inside another page (`X-Frame-Options`, Content-Security-Policy `frame-ancestors`), and
 * keep their logins in cookies that browsers don't send to framed pages (`SameSite=Lax`). For
 * pages inside frames, and only for those, this lifts both: the configurator's own page is
 * served unchanged.
 */

/** Whether a request comes from a page inside a frame (not the configurator's own page). */
function fromFrame(details) {
  if (details.resourceType === 'subFrame') return true;
  try {
    return Boolean(details.frame && details.frame.parent);
  } catch {
    // The frame may already be gone.
    return false;
  }
}

/** A header's values, whatever case it came in. */
function take(headers, name) {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  if (!key) return undefined;
  const values = headers[key];
  delete headers[key];
  return values;
}

/** The policy without its frame-ancestors directive (or nothing, if that was all of it). */
function withoutFrameAncestors(policy) {
  const kept = policy
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d && !/^frame-ancestors(\s|$)/i.test(d));
  return kept.length > 0 ? kept.join('; ') : null;
}

/** A cookie sent to framed pages too: SameSite=None, which needs Secure. */
function crossSiteCookie(cookie) {
  let next = cookie.replace(/;\s*SameSite=[^;]*/i, '');
  next += '; SameSite=None';
  if (!/;\s*Secure(\s*;|\s*$)/i.test(next)) next += '; Secure';
  return next;
}

/** Lets every site be shown, and stay logged in, inside the configurator's screens. */
function allowFraming(session) {
  session.webRequest.onHeadersReceived((details, callback) => {
    if (!fromFrame(details)) {
      callback({});
      return;
    }
    const headers = { ...details.responseHeaders };
    take(headers, 'x-frame-options');
    const policies = take(headers, 'content-security-policy');
    if (policies) {
      const kept = policies.map(withoutFrameAncestors).filter(Boolean);
      if (kept.length > 0) headers['Content-Security-Policy'] = kept;
    }
    const cookies = take(headers, 'set-cookie');
    if (cookies) {
      headers['Set-Cookie'] = details.url.startsWith('https://')
        ? cookies.map(crossSiteCookie)
        : cookies;
    }
    callback({ responseHeaders: headers });
  });
}

module.exports = { allowFraming, withoutFrameAncestors, crossSiteCookie };
