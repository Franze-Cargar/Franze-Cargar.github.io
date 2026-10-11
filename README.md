# FRANZE/DEV — Client-facing Portfolio Starter

**Owner:** Christian Franze Cargar  
**Status:** Ready for static portfolio publishing; PayMongo sandbox backend optional and **not yet verified**.

## Project files

- `index.html` — complete portfolio with six experience-based project showcases.
- `assets/styles.css` — responsive website theme.
- `assets/main.js` — mobile navigation.
- `payment-demo/` — checkout UI simulation, no financial processing by default.
- `payment-demo/config.js` — optional PUBLIC backend URL (never a secret).
- `worker/paymongo-worker.js` — optional Cloudflare Worker implementation for PayMongo API v2 in test mode; not deployed.
- `screenshots/` — add your own authorized, public-facing project screenshots.

## Fastest publishing path (GitHub Pages)

1. Sign into your personal GitHub account.
2. Create a **Public** repository named `<yourusername>.github.io` (or `franze-portfolio` if you prefer a subpath URL).
3. Upload the contents of this folder to the repository **root**, including `index.html` and `assets/`.
4. In the repository, open **Settings → Pages → Build and deployment → Deploy from a branch**.
5. Select `main` and `/(root)`, then click **Save**.
6. Wait for the site to publish. Visit `https://<yourusername>.github.io/` if repo name matches your username; otherwise `https://<yourusername>.github.io/franze-portfolio/`.
7. Test navigation, external links, and `/payment-demo/` on desktop and mobile.

Note: GitHub's official instructions: https://docs.github.com/en/pages/quickstart

## Must customize before sharing with clients

- Add your **personal contact email or professional LinkedIn**; the contact section currently reminds you to do so.
- Replace the designed sample previews marked **SCREENSHOT PLACEHOLDER** with real, authorized project screenshots.
- Confirm every live URL and that you've secured permission to use any former employer/client branding.
- Add verified PETD / PEJ public links only once checked; we purposely do not guess them.
- Review wording about your personal contributions for accuracy.

## Payment demo: current state

`payment-demo/` has a fully interactive **UI simulation** button with input validation. The simulated action does **not** call any provider or represent a completed payment. Do **not** claim that a real payment integration is finished.

A Cloudflare Worker with PayMongo v2 integration is supplied as an **optional implementation draft**. It is not connected or tested, and requires a PayMongo TEST secret, Cloudflare account, return URLs, tester access token, and end-to-end verification.

### Cloudflare Worker installation (after portfolio publication)

1. Create an account in PayMongo and obtain **`sk_test_...`** from the Developer settings.
2. In Cloudflare Workers, create a Worker and replace its source with `worker/paymongo-worker.js`.
3. Add Worker environment variables: `ALLOWED_ORIGIN` (`https://<username>.github.io`), and `RETURN_BASE_URL` (full portfolio URL, including `/franze-portfolio` if using that repository name).
4. Add Worker **secrets**: `PAYMONGO_TEST_SECRET_KEY` and `DEMO_ACCESS_TOKEN` (use a unique high-entropy token; never commit keys/tokens to GitHub).
5. Configure the public `workerBaseUrl` in `payment-demo/config.js` with the Worker address (PUBLIC URL ONLY).
6. The checkout page automatically displays a private tester access-code field once a public Worker URL is configured. Give the code only to authorized testers. It is not stored in frontend files.
7. Run an authorized test checkout, verify via PayMongo dashboard, and implement server-side webhook verification before describing the demo as completed.

**Security:** GitHub Pages has no private server runtime. Never use live API keys or store payment secrets in browser code. Cloudflare Worker access tokens should not be embedded in the public site.

PayMongo references: https://docs.paymongo.com/docs/payment-channels-hosted-checkout-quick-start , https://docs.paymongo.com/docs/payment-channels-hosted-checkout

## Credits and content safety

All described project roles are based on the portfolio master reference. No fabricated public metrics or payment-integration successes are claimed. The visual website previews are stylized placeholders, not actual screenshots.
