(() => {
  const triggers = [...document.querySelectorAll('a[href*="index.html?submit=catch"],a[href*="index.html?submit=recipe"]')];
  if (!triggers.length) return;

  const style = document.createElement('style');
  style.textContent = `
    .site-submission-overlay{width:min(900px,calc(100vw - 32px));height:min(780px,calc(100dvh - 32px));max-width:none;max-height:none;margin:auto;padding:0;border:0;border-radius:16px;background:transparent;box-shadow:0 28px 80px rgba(0,15,24,.55);overflow:hidden}
    .site-submission-overlay::backdrop{background:rgba(0,15,24,.78);backdrop-filter:blur(5px)}
    .site-submission-overlay iframe{display:block;width:100%;height:100%;border:0;border-radius:16px;background:transparent}
    .site-submission-overlay.is-auth{height:min(440px,calc(100dvh - 32px))}
    @media(max-width:680px){.site-submission-overlay{width:100vw;height:100dvh;border-radius:0}.site-submission-overlay iframe{border-radius:0}}
  `;
  document.head.append(style);

  const overlay = document.createElement('dialog');
  overlay.className = 'site-submission-overlay';
  overlay.setAttribute('aria-label', 'Submit a catch');
  overlay.innerHTML = '<iframe title="Catch submission form"></iframe>';
  document.body.append(overlay);
  const frame = overlay.querySelector('iframe');
  const submissionUrl = `${triggers[0].href}&embedded=site&overlay=light-2`;

  function openSubmission(event) {
    event.preventDefault();
    const frameDocument = frame.contentDocument;
    const formDialog = frameDocument?.querySelector('#catch-submission');
    const recipeDialog = frameDocument?.querySelector('#recipe-submission');
    const memberDialog = frameDocument?.querySelector('#member-dialog');
    const signedOut = frameDocument?.querySelector('[data-auth-label]')?.textContent.trim() === 'Member sign in';
    const wantsRecipe = event.currentTarget.href.includes('submit=recipe');
    if (signedOut) {
      if (!memberDialog?.open) frameDocument?.querySelector('[data-auth-trigger]')?.click();
      overlay.classList.add('is-auth');
    } else if (wantsRecipe) {
      if (formDialog?.open) formDialog.close();
      if (!recipeDialog?.open) frameDocument?.querySelector('[data-open-recipe-submission]')?.click();
      overlay.classList.remove('is-auth');
    } else {
      if (recipeDialog?.open) recipeDialog.close();
      if (!formDialog?.open) frameDocument?.querySelector('[data-open-submission]')?.click();
      overlay.classList.remove('is-auth');
    }
    if (!overlay.open) overlay.showModal();
  }

  triggers.forEach(trigger => trigger.addEventListener('click', openSubmission));
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.close(); });
  frame.addEventListener('load', () => {
    const frameDocument = frame.contentDocument;
    const frameStyle = frameDocument?.createElement('style');
    if (!frameStyle) return;
    frameStyle.textContent = '#sv-facebook-clubhouse .site > :not(dialog):not(.action-toast){display:none!important} #sv-facebook-clubhouse .site{min-height:0!important;background:transparent!important} body{background:transparent!important} #catch-submission,#recipe-submission,#member-dialog{width:100%!important;max-width:none!important;height:100%!important;max-height:none!important;margin:0!important;border-radius:16px!important;color-scheme:light!important} #catch-submission::backdrop,#recipe-submission::backdrop,#member-dialog::backdrop{background:transparent!important}';
    frameDocument.head.append(frameStyle);
    const closeOuter = () => { if (overlay.open) overlay.close(); };
    frameDocument.querySelectorAll('#catch-submission,#recipe-submission,#member-dialog').forEach(dialog => dialog.addEventListener('close', closeOuter));
    frameDocument.querySelectorAll('[data-close-submission],[data-close-recipe-submission],[data-close-auth]').forEach(button => button.addEventListener('click', closeOuter));
    let attempts = 0;
    const revealForm = setInterval(() => {
      const formDialog = frameDocument.querySelector('#catch-submission');
      const memberDialog = frameDocument.querySelector('#member-dialog');
      if (memberDialog?.open) { overlay.classList.add('is-auth'); clearInterval(revealForm); return; }
      if (formDialog?.open) { overlay.classList.remove('is-auth'); clearInterval(revealForm); return; }
      if (attempts > 15) {
        const signedOut = frameDocument.querySelector('[data-auth-label]')?.textContent.trim() === 'Member sign in';
        frameDocument.querySelector(signedOut ? '[data-auth-trigger]' : '[data-open-submission]')?.click();
      }
      if (formDialog?.open || attempts++ > 45) clearInterval(revealForm);
    }, 100);
  });
  overlay.addEventListener('close', () => {
    const frameDocument = frame.contentDocument;
    frameDocument?.querySelectorAll('#catch-submission[open],#recipe-submission[open],#member-dialog[open]').forEach(dialog => dialog.close());
  });
  frame.src = submissionUrl;
})();
