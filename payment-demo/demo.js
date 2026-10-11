const result = document.getElementById('result');
const simulateButton = document.getElementById('simulate-checkout');
const sandboxButton = document.getElementById('sandbox-checkout');
const sandboxPanel = document.getElementById('sandbox-panel');
const testerCode = document.getElementById('tester-code');
const nameField = document.getElementById('buyer-name');
const emailField = document.getElementById('buyer-email');
const workerUrl = (window.PAYMENT_DEMO?.workerBaseUrl || '').trim().replace(/\/$/, '');

function showResult(text, isError = false) {
  result.hidden = false;
  result.classList.toggle('error', isError);
  result.textContent = text;
}
function validate() {
  const name = nameField.value.trim();
  const email = emailField.value.trim();
  if (name.length < 2) { nameField.focus(); showResult('Please enter a demo name with at least two characters.', true); return false; }
  if (!emailField.checkValidity() || !email) { emailField.focus(); showResult('Please enter an email in a valid format.', true); return false; }
  return true;
}
simulateButton.addEventListener('click', () => {
  if (!validate()) return;
  showResult(`UI simulation complete for ${nameField.value.trim()}. No API call was made, no payment was processed, and no confirmation email was sent.`);
});

if (workerUrl) {
  sandboxPanel.hidden = false;
  sandboxButton.addEventListener('click', async () => {
    if (!validate()) return;
    if (testerCode.value.trim().length < 12) { showResult('Please enter the private sandbox test access code.', true); testerCode.focus(); return; }
    sandboxButton.disabled = true;
    sandboxButton.textContent = 'Starting test checkout…';
    showResult('Requesting a PayMongo test session via the secure backend. No real payment will be charged.');
    try {
      const response = await fetch(`${workerUrl}/api/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Demo-Token': testerCode.value.trim() },
        body: JSON.stringify({ name: nameField.value.trim(), email: emailField.value.trim() })
      });
      const json = await response.json();
      if (!response.ok || !json.checkout_url) throw new Error(json.error || 'Unable to start test checkout.');
      const target = new URL(json.checkout_url);
      if (target.protocol !== 'https:' || target.hostname !== 'checkout.paymongo.com') throw new Error('Checkout URL failed validation.');
      window.location.assign(target.href);
    } catch (error) {
      showResult(`Sandbox connection failed: ${error.message}. You can still use the UI simulation.`, true);
      sandboxButton.disabled = false;
      sandboxButton.textContent = 'Open PayMongo test checkout ↗';
    }
  });
}
