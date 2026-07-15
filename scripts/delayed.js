/*
 * Delayed-phase martech (EDS convention: consent/martech never load eager).
 *
 * Cookie consent, matching the original blog.clover.com setup: the OneTrust
 * otSDKStub with the donor's domain-script id. The floating "Manage
 * Preferences" icon (#ot-sdk-btn-floating) is pinned bottom-LEFT like the
 * original. If OneTrust refuses to serve its config on this host
 * (domain-locked), a self-contained fallback banner + floating icon ships
 * instead (localStorage-backed).
 *
 * NOTE: there is no other martech on the migrated site, so consent here is
 * informational — no scripts are gated on the choice.
 */

const OT_STUB_SRC = 'https://cdn.cookielaw.org/scripttemplates/otSDKStub.js';
const OT_DOMAIN_SCRIPT = '019c98ab-9ac2-7f05-932d-9b6f249a33be';
const CONSENT_KEY = 'clover-blog-consent';

const FALLBACK_CSS = `
  .fc-banner {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2147483645;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
    justify-content: center;
    padding: 20px 24px;
    background: #fff;
    border-top: 1px solid var(--chrome-hairline, #e5e5e5);
    box-shadow: 0 -6px 24px rgb(0 0 0 / 10%);
    font-family: var(--body-font-family, sans-serif);
    font-size: 14px;
    line-height: 1.5;
    color: #000;
  }

  .fc-banner p { margin: 0; max-width: 70ch; }
  .fc-banner .fc-actions { display: flex; gap: 12px; }

  .fc-banner button {
    appearance: none;
    min-height: 44px;
    padding: 10px 20px;
    border-radius: 8px;
    border: 1px solid var(--chrome-green, #280);
    background: var(--chrome-green, #280);
    color: #fff;
    font-family: inherit;
    font-size: 14px;
    cursor: pointer;
  }

  .fc-banner button.fc-reject {
    background: transparent;
    color: var(--chrome-green, #280);
  }

  .fc-float {
    position: fixed;
    left: 1vw;
    bottom: 10px;
    z-index: 2147483644;
    width: 50px;
    height: 50px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--chrome-green-band, #257d1c);
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 8px rgb(0 0 0 / 30%);
  }

  .fc-banner button:focus-visible,
  .fc-float:focus-visible {
    outline: 2px solid var(--chrome-green, #280);
    outline-offset: 2px;
  }
`;

const COOKIE_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10 3 3 0 0 1-3.5-2.96A3 3 0 0 1 15 6a3 3 0 0 1-3-3 1 1 0 0 0-.9-1H12zm-4 8a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm3 5.5A1.5 1.5 0 1 1 9.5 17a1.5 1.5 0 0 1 1.5-1.5zm4-2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/></svg>';

function showFallbackBanner(container) {
  if (container.querySelector('.fc-banner')) return;
  const banner = document.createElement('div');
  banner.className = 'fc-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Cookie preferences');
  banner.innerHTML = `
    <p>This site stores only strictly necessary data in your browser. It sets
    no advertising or analytics cookies. Choose whether to allow optional
    cookies should any be introduced in the future.</p>
    <span class="fc-actions">
      <button type="button" class="fc-reject">Reject optional</button>
      <button type="button" class="fc-accept">Accept</button>
    </span>
  `;
  const choose = (value) => {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch (e) {
      // storage unavailable — treat as session-only choice
    }
    banner.remove();
  };
  banner.querySelector('.fc-accept').addEventListener('click', () => choose('accepted'));
  banner.querySelector('.fc-reject').addEventListener('click', () => choose('rejected'));
  container.append(banner);
}

function initFallbackConsent() {
  if (document.getElementById('fallback-consent')) return;
  const container = document.createElement('div');
  container.id = 'fallback-consent';
  const style = document.createElement('style');
  style.textContent = FALLBACK_CSS;
  container.append(style);

  const float = document.createElement('button');
  float.type = 'button';
  float.className = 'fc-float';
  float.setAttribute('aria-label', 'Cookie preferences');
  float.innerHTML = COOKIE_SVG;
  float.addEventListener('click', () => showFallbackBanner(container));
  container.append(float);

  document.body.append(container);

  let choice = null;
  try {
    choice = localStorage.getItem(CONSENT_KEY);
  } catch (e) {
    // storage unavailable
  }
  if (!choice) showFallbackBanner(container);
}

function loadOneTrust() {
  // OneTrust's banner script calls this global when ready
  if (typeof window.OptanonWrapper !== 'function') {
    window.OptanonWrapper = () => {};
  }
  const stub = document.createElement('script');
  stub.src = OT_STUB_SRC;
  stub.charset = 'UTF-8';
  stub.dataset.domainScript = OT_DOMAIN_SCRIPT;
  stub.addEventListener('error', initFallbackConsent);
  document.head.append(stub);
  // if OneTrust never materializes (domain-locked config), ship the fallback
  setTimeout(() => {
    if (!document.getElementById('onetrust-consent-sdk')) initFallbackConsent();
  }, 10000);
}

loadOneTrust();
