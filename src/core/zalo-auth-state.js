// Zalo briefly uses its login title while restoring an authenticated document.
// Suppress capture during that ambiguity; do not interpret the initial title
// alone as a confirmed sign-out until it persists. A later sign-out is immediate.
export function createZaloAuthState(graceMs = 15000) {
  let loginSince = null;
  let authenticated = false;
  return ({title = '', account = {}, now = Date.now()}) => {
    const loginTitle = /Zalo\s*-\s*(?:Đăng nhập|Login|Sign in)/i.test(title);
    if (loginTitle) {
      if (loginSince === null) loginSince = now;
      return {capture: false, loggedOut: authenticated || now - loginSince >= graceMs};
    }
    // A neutral loading title after the login screen is not proof that the
    // account has been restored. Wait for an explicit identity before capture.
    if (loginSince !== null && !account.id && !account.name)
      return {capture: false, loggedOut: false};
    loginSince = null;
    if (account.id || account.name) authenticated = true;
    return {capture: true, loggedOut: false};
  };
}
