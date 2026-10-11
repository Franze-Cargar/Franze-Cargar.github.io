# FRANZE/DEV — Developer Portfolio

**Owner:** Christian Franze Cargar  
**Status:** Static developer portfolio; payment checkout is a UI simulation. The optional PayMongo sandbox backend is **not yet verified**.

## Project files

- `index.html` — complete portfolio with six experience-based project showcases.
- `assets/styles.css` — responsive website theme.
- `assets/main.js` — mobile navigation.
- `payment-demo/` — checkout UI simulation, no financial processing by default.
- `payment-demo/config.js` — optional PUBLIC backend URL (never a secret).
- `worker/paymongo-worker.js` — optional Cloudflare Worker implementation for PayMongo API v2 in test mode; not deployed.
- `screenshots/` — add your own authorized, public-facing project screenshots.

## Repository context

This is the existing `Franze-Cargar/Franze-Cargar.github.io` repository. The portfolio entry point is `index.html` at the repository root, with supporting files in `assets/` and `payment-demo/`. Repository creation and initial-upload instructions are no longer applicable. Hosting settings are managed separately from content edits.

## Must customize before sharing with clients

- The contact section currently links to `https://github.com/Franze-Cargar`, suggests introductions through the colleague who shared the portfolio, and notes that a personal business email can be added once finalized.
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
3. For this repository's root GitHub Pages URL, set Worker environment variables `ALLOWED_ORIGIN` and `RETURN_BASE_URL` to `https://Franze-Cargar.github.io`. If using a custom domain, use that portfolio origin and URL instead.
4. Add Worker **secrets**: `PAYMONGO_TEST_SECRET_KEY` and `DEMO_ACCESS_TOKEN` (use a unique high-entropy token; never commit keys/tokens to GitHub).
5. Configure the public `workerBaseUrl` in `payment-demo/config.js` with the Worker address (PUBLIC URL ONLY).
6. The checkout page automatically displays a private tester access-code field once a public Worker URL is configured. Give the code only to authorized testers. It is not stored in frontend files.
7. Run an authorized test checkout, verify via PayMongo dashboard, and implement server-side webhook verification before describing the demo as completed.

**Security:** GitHub Pages has no private server runtime. Never use live API keys or store payment secrets in browser code. Cloudflare Worker access tokens should not be embedded in the public site.

PayMongo references: https://docs.paymongo.com/docs/payment-channels-hosted-checkout-quick-start , https://docs.paymongo.com/docs/payment-channels-hosted-checkout

## Credits and content safety

Project descriptions are based on Christian Franze Cargar's confirmed work history:

- **C&E:** Approximately November 2017–August 2024. Revised the entire KITE.PH front end; contributed to Philippine E-Journals' front end, back end, and MySQL database as a team member; initially designed and laid out PETD's entire front end, then several years later became lead developer for its back end and database, implementing features based on PEJ.
- **Knowledge Channel Foundation:** August 2024–present. Website administration, maintenance, customization, web content, event pages, automation, and IT systems support. AI-assisted work includes the custom DepEd TV frontend connected to Google Sheets and Google Apps Script for weekly TV schedule updates, and LMS-inspired Squarespace Learning Hub pages including Marungko and linked lesson experiences. General website management is not described as AI-assisted, and the Learning Hub is not presented as a full LMS.
- **Technical background:** Traditional development with PHP, MySQL, JavaScript, HTML, and CSS; AWS experience; Google Sheets, Google Apps Script, Power Automate, Make.com, ChatGPT, Gemini, and Claude.

No fabricated achievements, results, certifications, testimonials, or completed payment integrations are claimed. The visual website previews are stylized placeholders, not actual screenshots.
