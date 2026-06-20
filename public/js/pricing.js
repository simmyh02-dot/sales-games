const SCG_PRICING = (() => {
  const MODAL_HTML = `
    <div id="pricing-modal" class="pricing-modal-overlay" style="display:none;">
      <div class="pricing-modal">
        <div class="pricing-modal-header">
          <h3>You've hit your session limit</h3>
          <p>Upgrade to keep training. No interruptions.</p>
        </div>
        <div class="pricing-cards">
          <div class="pricing-card">
            <div class="pricing-tier">Free</div>
            <div class="pricing-amount">$0</div>
            <div class="pricing-sessions">5 sessions / month</div>
            <div class="pricing-note">Your current plan</div>
          </div>
          <div class="pricing-card featured">
            <div class="pricing-badge">Most popular</div>
            <div class="pricing-tier">Pro</div>
            <div class="pricing-amount">$15<span>/mo</span></div>
            <div class="pricing-sessions">60 sessions / month</div>
            <button class="btn btn-primary" onclick="SCG_PRICING.checkout('pro')">Upgrade to Pro</button>
          </div>
          <div class="pricing-card">
            <div class="pricing-tier">Power</div>
            <div class="pricing-amount">$29<span>/mo</span></div>
            <div class="pricing-sessions">Unlimited sessions</div>
            <button class="btn btn-secondary" onclick="SCG_PRICING.checkout('power')">Go Power</button>
          </div>
        </div>
        <button class="pricing-close" onclick="SCG_PRICING.hideModal()">Maybe later</button>
      </div>
    </div>`;

  function ensureModal() {
    if (document.getElementById("pricing-modal")) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = MODAL_HTML;
    document.body.appendChild(wrap.firstElementChild);
  }

  function showModal() {
    ensureModal();
    const modal = document.getElementById("pricing-modal");
    if (modal) modal.style.display = "flex";
  }

  function hideModal() {
    const modal = document.getElementById("pricing-modal");
    if (modal) modal.style.display = "none";
  }

  async function checkout(tier) {
    const token = localStorage.getItem("scg_auth_token");
    if (!token) { window.location.href = "/"; return; }
    try {
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; }
      else { alert(data.error || "Could not start checkout. Please try again."); }
    } catch {
      alert("Could not connect to payment server. Please try again.");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("upgraded") === "1") {
      history.replaceState({}, "", window.location.pathname);
      const toast = document.createElement("div");
      toast.className = "upgrade-toast";
      toast.textContent = "Plan upgraded. Happy training.";
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    }

    const upgradeTier = params.get("upgrade");
    if (upgradeTier === "pro" || upgradeTier === "power") {
      history.replaceState({}, "", window.location.pathname);
      setTimeout(() => checkout(upgradeTier), 600);
    }
  });

  return { showModal, hideModal, checkout };
})();
