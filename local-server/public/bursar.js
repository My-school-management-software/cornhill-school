(() => {
  "use strict";

  const byId = id => document.getElementById(id);
  const API = "/api/v1";
  let activeLearnerId = null;
  let accountSnapshot = null;
  let pendingSubmission = null;
  let canReprintReceipts = false;
  let canAllocateCredits = false;
  let creditSources = [];
  const PENDING_KEY_STORAGE = "cornhill.finance.pending-payment-key";
  const PENDING_CREDIT_STORAGE = "cornhill.finance.pending-credit-allocation";
  const PENDING_CREDIT_KEY_STORAGE = "cornhill.finance.pending-credit-key";
  function readRecoveredPaymentKey() {
    try {
      const value = sessionStorage.getItem(PENDING_KEY_STORAGE);
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || "") ? value : null;
    } catch { return null; }
  }
  function saveRecoveredPaymentKey(value) {
    try {
      if (value) sessionStorage.setItem(PENDING_KEY_STORAGE, value);
      else sessionStorage.removeItem(PENDING_KEY_STORAGE);
    } catch { /* In-memory idempotency remains active for this page session. */ }
  }
  let recoveredIdempotencyKey = readRecoveredPaymentKey();

  function readPendingCreditSubmission(actorStaffId) {
    const suffix = ":" + actorStaffId;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const valid = value => value && uuid.test(value.key || "") && uuid.test(value.learnerId || "");
    try {
      const raw = sessionStorage.getItem(PENDING_CREDIT_STORAGE + suffix);
      if (raw) {
        const value = JSON.parse(raw);
        if (valid(value) && value.body && uuid.test(value.body.sourcePaymentId || "") &&
            typeof value.body.reason === "string" && value.body.reason.trim().length >= 5 &&
            value.body.reason.trim().length <= 300 && Array.isArray(value.body.allocations) &&
            value.body.allocations.length >= 1 && value.body.allocations.length <= 100 &&
            value.body.allocations.every(item => item && uuid.test(item.feeObligationId || "") &&
              Number.isSafeInteger(item.amountUgx) && item.amountUgx > 0)) return value;
        sessionStorage.removeItem(PENDING_CREDIT_STORAGE + suffix);
      }
      const saved = localStorage.getItem(PENDING_CREDIT_KEY_STORAGE + suffix);
      if (!saved) return null;
      const value = JSON.parse(saved);
      return valid(value) ? { key: value.key, learnerId: value.learnerId, body: null, recovered: true } : null;
    } catch { return null; }
  }
  function savePendingCreditSubmission(value) {
    const suffix = currentStaffId ? ":" + currentStaffId : "";
    try {
      if (value) {
        sessionStorage.setItem(PENDING_CREDIT_STORAGE + suffix, JSON.stringify(value));
        localStorage.setItem(PENDING_CREDIT_KEY_STORAGE + suffix, JSON.stringify({
          key: value.key, learnerId: value.learnerId
        }));
      } else {
        sessionStorage.removeItem(PENDING_CREDIT_STORAGE + suffix);
        localStorage.removeItem(PENDING_CREDIT_KEY_STORAGE + suffix);
      }
    } catch { /* The server remains authoritative; do not store financial details in persistent storage. */ }
  }
  let currentStaffId = null;
  let pendingCreditSubmission = null;

  function money(value) {
    const amount = Number(value ?? 0);
    return "UGX " + new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0);
  }

  function showMessage(id, message, kind = "") {
    const node = byId(id);
    node.textContent = message;
    node.className = "form-message" + (kind ? " " + kind : "");
  }

  function setServiceNotice(message, error = false) {
    const node = byId("service-state");
    node.textContent = message;
    node.className = "notice" + (error ? " error" : "");
    node.hidden = !message;
  }

  function csrfToken() {
    const prefix = "__Host-cornhill_csrf=";
    const item = document.cookie.split(";").map(value => value.trim()).find(value => value.startsWith(prefix));
    return item ? decodeURIComponent(item.slice(prefix.length)) : "";
  }

  async function request(path, { method = "GET", body, idempotencyKey } = {}) {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET") headers["X-Cornhill-CSRF"] = csrfToken();
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    let response;
    try {
      response = await fetch(API + path, {
        method, headers, credentials: "same-origin",
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store"
      });
    } catch {
      throw new Error("The local server could not be reached. Check that the school computer service is running.");
    }
    let data = {};
    try { data = await response.json(); } catch { /* Use a safe generic response below. */ }
    if (!response.ok) {
      const error = new Error(data.error || "The request could not be completed.");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function permissionGranted(principal) {
    if (!principal || principal.principalType !== "staff") return false;
    return (principal.roles || []).some(role =>
      Array.isArray(principal.rolePermissions?.[role]) &&
      principal.rolePermissions[role].includes("finance.payments_record")
    );
  }

  function showLogin(message = "") {
    byId("workspace").hidden = true;
    byId("login-panel").hidden = false;
    byId("learner-panel").hidden = true;
    byId("receipt-panel").hidden = true;
    showMessage("login-message", message, message ? "error" : "");
  }

  async function establishSession(principal) {
    if (!permissionGranted(principal)) {
      showLogin("Your staff account does not currently have permission to record school payments. Contact the authorised school administrator.");
      return;
    }
    byId("login-panel").hidden = true;
    byId("workspace").hidden = false;
    currentStaffId = principal.id;
    pendingCreditSubmission = readPendingCreditSubmission(currentStaffId);
    byId("staff-label").textContent = "Signed in as " + (principal.displayName || "authorised staff member");
    canReprintReceipts = (principal.roles || []).some(role =>
      Array.isArray(principal.rolePermissions?.[role]) &&
      principal.rolePermissions[role].includes("finance.receipts_reprint")
    );
    byId("reprint-panel").hidden = !canReprintReceipts;
    canAllocateCredits = (principal.roles || []).some(role =>
      Array.isArray(principal.rolePermissions?.[role]) &&
      principal.rolePermissions[role].includes("finance.credit_allocate")
    );
    byId("credit-section").hidden = !canAllocateCredits;
    byId("login-message").textContent = "";
  }

  async function checkSession() {
    try {
      const result = await request("/auth/session");
      await establishSession(result.principal);
    } catch (error) {
      showLogin(error.status === 401 ? "" : error.message);
    }
  }

  async function initialise() {
    try {
      const response = await fetch("/api/v1/health", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Health check failed.");
      const health = await response.json();
      if (health.financeApiEnabled !== true) {
        byId("login-panel").hidden = true;
        byId("finance-disabled").hidden = false;
        setServiceNotice("Local server reachable. Finance database access has not been activated.", true);
        return;
      }
      setServiceNotice("Secure local finance connection is available.");
      await checkSession();
    } catch {
      setServiceNotice("The local Bursar service is not reachable. Start the approved local service on this computer.", true);
      byId("login-panel").hidden = true;
    }
  }

  byId("login-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    showMessage("login-message", "Verifying staff account…");
    try {
      await request("/auth/staff/login", {
        method: "POST",
        body: { username: byId("username").value.trim(), password: byId("password").value }
      });
      byId("password").value = "";
      await checkSession();
    } catch (error) {
      showMessage("login-message", error.message, "error");
    } finally {
      button.disabled = false;
    }
  });

  byId("logout-button").addEventListener("click", async () => {
    try { await request("/auth/logout", { method: "POST", body: {} }); } catch { /* Clear the local workspace regardless. */ }
    activeLearnerId = null;
    accountSnapshot = null;
    creditSources = [];
    byId("credit-section").hidden = true;
    byId("learner-panel").hidden = true;
    byId("receipt-panel").hidden = true;
    showLogin("You have signed out.");
  });

  function renderSearchResults(learners) {
    const container = byId("search-results");
    container.replaceChildren();
    if (!learners.length) {
      showMessage("search-message", "No active learner matched that search.");
      return;
    }
    showMessage("search-message", learners.length + " learner record(s) found.");
    for (const learner of learners) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "result-button";
      const label = document.createElement("span");
      label.className = "result-name";
      label.textContent = learner.learnerName;
      const details = document.createElement("span");
      details.className = "result-meta";
      details.textContent = learner.pupilCode + " · " + (learner.className || "Class not assigned");
      const left = document.createElement("span");
      left.append(label, details);
      const right = document.createElement("span");
      right.className = "badge";
      right.textContent = learner.isBursary ? "BURSARY" : "STANDARD";
      button.append(left, right);
      button.addEventListener("click", () => loadLearner(learner.learnerId));
      container.append(button);
    }
  }

  byId("search-form").addEventListener("submit", async event => {
    event.preventDefault();
    const search = byId("learner-search").value.trim();
    if (search.length < 2) {
      showMessage("search-message", "Enter at least two characters.", "error");
      return;
    }
    showMessage("search-message", "Searching learner records…");
    byId("search-results").replaceChildren();
    try {
      const result = await request("/finance/learners?search=" + encodeURIComponent(search));
      renderSearchResults(result.learners || []);
    } catch (error) {
      showMessage("search-message", error.message, "error");
    }
  });

  async function loadLearner(learnerId) {
    if (pendingSubmission || (pendingCreditSubmission && learnerId !== pendingCreditSubmission.learnerId)) {
      showMessage("search-message", "A finance request is awaiting confirmation. Open the same learner and retry that exact request before switching to another learner.", "error");
      return;
    }
    try {
      const result = await request("/finance/learners/" + encodeURIComponent(learnerId) + "/account");
      activeLearnerId = learnerId;
      accountSnapshot = result.account;
      renderAccount(accountSnapshot);
      byId("learner-panel").hidden = false;
      byId("receipt-panel").hidden = true;
      if (canAllocateCredits) await loadLearnerCredits(learnerId);
      byId("payment-form").reset();
      if (recoveredIdempotencyKey) {
        byId("pending-note").hidden = false;
        byId("pending-note").textContent = "A payment request key from this browser tab is awaiting confirmation. Re-enter the exact same payment details to safely check or retry that submission.";
      }
      byId("payment-method").value = "cash";
      byId("collection-item").value = "School fees";
      updateAllocationSummary();
      byId("learner-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      showMessage("search-message", error.message, "error");
    }
  }

  function renderAccount(account) {
    const learner = account.learner;
    byId("learner-name").textContent = learner.learner_name || "Learner";
    byId("learner-meta").textContent =
      (learner.pupil_code || "No pupil code") +
      (learner.lin ? " · LIN " + learner.lin : "") +
      (learner.class_name ? " · " + learner.class_name : "");
    byId("bursary-badge").hidden = !learner.is_bursary;
    byId("total-charged").textContent = money(account.totals.charged_ugx);
    byId("total-paid").textContent = money(account.totals.paid_ugx);
    byId("total-balance").textContent = money(account.totals.balance_ugx);
    const list = byId("fee-obligations");
    list.replaceChildren();
    const items = account.fee_obligations || [];
    if (!items.length) {
      const message = document.createElement("p");
      message.className = "muted";
      message.textContent = "No fee obligations have been entered for this learner yet.";
      list.append(message);
      return;
    }
    for (const item of items) {
      const row = document.createElement("div");
      row.className = "fee-row";
      row.dataset.feeId = item.fee_obligation_id;
      row.dataset.balance = String(Number(item.balance_ugx));
      const title = document.createElement("div");
      title.className = "fee-title";
      const name = document.createElement("strong");
      name.textContent = item.fee_item_name || "School fee";
      const term = document.createElement("small");
      term.textContent = (item.academic_year || "") + " · " + (item.term_name || "Term");
      const status = document.createElement("span");
      status.className = "fee-status";
      status.textContent = item.term_status === "Active" ? "CURRENT TERM" : "PREVIOUS / OTHER TERM";
      title.append(name, term, status);
      const charged = document.createElement("div");
      const chargedLabel = document.createElement("small");
      chargedLabel.textContent = "Charged";
      const chargedValue = document.createElement("strong");
      chargedValue.textContent = money(item.amount_ugx);
      charged.append(chargedLabel, document.createElement("br"), chargedValue);
      const balance = document.createElement("div");
      const balanceLabel = document.createElement("small");
      balanceLabel.textContent = "Outstanding";
      const balanceValue = document.createElement("strong");
      balanceValue.className = "fee-balance";
      balanceValue.textContent = money(item.balance_ugx);
      balance.append(balanceLabel, document.createElement("br"), balanceValue);
      const allocation = document.createElement("div");
      allocation.className = "allocation-control";
      const checkboxLabel = document.createElement("label");
      checkboxLabel.className = "check-field";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "fee-select";
      checkbox.disabled = Number(item.balance_ugx) <= 0;
      const labelText = document.createElement("span");
      labelText.textContent = "Allocate";
      checkboxLabel.append(checkbox, labelText);
      const amount = document.createElement("input");
      amount.type = "number";
      amount.className = "fee-allocation";
      amount.min = "0";
      amount.step = "1";
      amount.max = String(Number(item.balance_ugx));
      amount.value = String(Number(item.balance_ugx));
      amount.setAttribute("aria-label", "Amount to allocate to " + (item.fee_item_name || "fee"));
      amount.disabled = true;
      checkbox.addEventListener("change", () => {
        amount.disabled = !checkbox.checked;
        if (checkbox.checked) {
          const available = Math.max(0, (Number(byId("amount-received").value) || Number(item.balance_ugx)) -
            selectedAllocationTotal(row));
          amount.value = String(Math.min(Number(item.balance_ugx), available));
        }
        updateAllocationSummary();
      });
      amount.addEventListener("input", updateAllocationSummary);
      allocation.append(checkboxLabel, amount);
      row.append(title, charged, balance, allocation);
      list.append(row);
    }
  }

  function selectedAllocationTotal(exceptRow = null) {
    let total = 0;
    document.querySelectorAll(".fee-row").forEach(row => {
      if (row === exceptRow) return;
      const checkbox = row.querySelector(".fee-select");
      const amount = row.querySelector(".fee-allocation");
      if (checkbox?.checked) total += Number(amount.value) || 0;
    });
    return total;
  }

  function setPaymentFormLocked(locked) {
    byId("payment-form").querySelectorAll("input, select, textarea").forEach(field => {
      field.disabled = locked;
    });
    document.querySelectorAll(".fee-row").forEach(row => {
      const checkbox = row.querySelector(".fee-select");
      const amount = row.querySelector(".fee-allocation");
      checkbox.disabled = locked || Number(row.dataset.balance) <= 0;
      amount.disabled = locked || !checkbox.checked;
    });
    byId("pending-note").hidden = !locked;
    byId("pending-note").textContent = locked
      ? "A payment request is awaiting confirmation. The next retry will resend the exact same learner, amount and allocations with the same idempotency key."
      : "";
  }

  function updateAllocationSummary() {
    let allocated = 0;
    let invalid = false;
    document.querySelectorAll(".fee-row").forEach(row => {
      const checkbox = row.querySelector(".fee-select");
      const amount = row.querySelector(".fee-allocation");
      if (!checkbox?.checked) return;
      const value = Number(amount.value);
      const maximum = Number(row.dataset.balance);
      if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) invalid = true;
      else allocated += value;
    });
    const received = Number(byId("amount-received").value) || 0;
    const remaining = received - allocated;
    byId("allocated-total").textContent = money(allocated);
    byId("unallocated-total").textContent = money(Math.max(remaining, 0));
    if (remaining < 0) {
      invalid = true;
      showMessage("allocation-message", "Allocated amounts exceed the amount received. Reduce an allocation before posting.", "error");
    } else if (invalid) {
      showMessage("allocation-message", "Each selected fee balance needs a positive whole-UGX amount not exceeding its balance.", "error");
    } else {
      showMessage("allocation-message", remaining > 0
        ? "The remaining " + money(remaining) + " will be retained as unallocated learner credit."
        : "All the money received is allocated to the selected fee balances.");
    }
    byId("post-payment-button").disabled = !activeLearnerId || received <= 0 || invalid;
  }

  byId("amount-received").addEventListener("input", updateAllocationSummary);
  byId("payment-method").addEventListener("change", () => {
    byId("provider-field").hidden = byId("payment-method").value !== "mobile_money";
  });

  function renderReceipt(payment) {
    const snapshot = payment.receipt || payment.receipt_data_snapshot || {};
    const receiptNumber = payment.receiptNumber || payment.receipt_number || "";
    const paymentStatus = payment.status || payment.payment_status || "Posted";
    const printCount = payment.print_count ?? null;
    const container = byId("receipt-content");
    container.replaceChildren();
    const addLine = (label, value, emphasis = false) => {
      const row = document.createElement("div");
      row.className = "receipt-line" + (emphasis ? " receipt-total" : "");
      const left = document.createElement("span");
      left.textContent = label;
      const right = document.createElement("strong");
      right.textContent = value;
      row.append(left, right);
      container.append(row);
    };
    const school = document.createElement("div");
    school.className = "receipt-school";
    school.textContent = snapshot.school_name || "CORNHILL NURSERY AND PRIMARY SCHOOL";
    const title = document.createElement("div");
    title.className = "receipt-title";
    title.textContent = payment.print_count != null ? "REPRINTED PAYMENT RECEIPT" : "OFFICIAL PAYMENT RECEIPT";
    container.append(school, title);
    addLine("Receipt No.", receiptNumber);
    if (paymentStatus === "Reversed") addLine("PAYMENT STATUS", "REVERSED — ORIGINAL RECEIPT COPY");
    if (printCount != null) addLine("Reprint Copy", String(printCount));
    addLine("Learner", snapshot.learner_name || "");
    addLine("Pupil Code", snapshot.pupil_code || "");
    addLine("Payer", snapshot.payer_name || "Not supplied");
    addLine("Collection", snapshot.collection_item || "School fees");
    addLine("Method", snapshot.payment_method || "");
    if (snapshot.mobile_money_provider) addLine("Provider", snapshot.mobile_money_provider);
    addLine("Amount Received", money(snapshot.amount_ugx), true);
    addLine("Unallocated Credit", money(snapshot.unallocated_amount_ugx));
    for (const item of snapshot.allocations || []) {
      addLine((item.term || "") + " · " + (item.fee_item || "Fee"), money(item.allocated_ugx));
    }
    const thanks = document.createElement("p");
    thanks.textContent = "Thank you. Please keep this receipt for your records.";
    thanks.className = "receipt-thanks";
    container.append(thanks);
    byId("reprint-number").value = receiptNumber;
    byId("receipt-panel").hidden = false;
    byId("receipt-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function selectedCreditSource() {
    const id = byId("credit-source-select").value;
    return creditSources.find(source => source.paymentId === id) || null;
  }

  function updateCreditSummary() {
    const source = selectedCreditSource();
    let total = 0;
    byId("credit-allocation-lines").querySelectorAll(".credit-allocation-amount").forEach(input => {
      const value = Number(input.value);
      if (Number.isSafeInteger(value) && value > 0) total += value;
    });
    const available = Number(source?.remainingCreditUgx ?? 0);
    byId("credit-allocation-total").textContent = money(total);
    byId("credit-remaining-total").textContent = money(Math.max(available - total, 0));
    return { total, available };
  }

  function renderCreditAllocationLines() {
    const container = byId("credit-allocation-lines");
    container.replaceChildren();
    const items = (accountSnapshot?.fee_obligations || []).filter(item => Number(item.balance_ugx) > 0);
    if (!items.length) {
      const message = document.createElement("p");
      message.className = "muted";
      message.textContent = "There are no outstanding fee balances to receive retained credit.";
      container.append(message);
      return;
    }
    for (const item of items) {
      const row = document.createElement("label");
      row.className = "credit-allocation-row";
      const description = document.createElement("span");
      description.textContent = (item.fee_item_name || "Fee") + " · " +
        (item.academic_year || "") + " · " + (item.term_name || "Term") +
        " · Balance " + money(item.balance_ugx);
      const input = document.createElement("input");
      input.type = "number";
      input.inputMode = "numeric";
      input.min = "0";
      input.max = String(Number(item.balance_ugx));
      input.step = "1";
      input.placeholder = "0";
      input.className = "credit-allocation-amount";
      input.dataset.feeId = item.fee_obligation_id;
      input.addEventListener("input", updateCreditSummary);
      row.append(description, input);
      container.append(row);
    }
    updateCreditSummary();
  }

  function renderCreditSources() {
    const list = byId("credit-sources");
    const form = byId("credit-allocation-form");
    const select = byId("credit-source-select");
    list.replaceChildren();
    select.replaceChildren();
    if (!creditSources.length) {
      if (pendingCreditSubmission && pendingCreditSubmission.learnerId === activeLearnerId) {
        form.hidden = false;
        const option = document.createElement("option");
        option.value = pendingCreditSubmission.body.sourcePaymentId;
        option.textContent = "Pending allocation — retry original request";
        select.append(option);
        renderCreditAllocationLines();
        restorePendingCreditForm();
        return;
      }
      form.hidden = true;
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No retained learner credit is currently available.";
      list.append(empty);
      return;
    }
    for (const source of creditSources) {
      const card = document.createElement("div");
      card.className = "credit-source-card";
      const receipt = document.createElement("strong");
      receipt.textContent = source.receiptNumber;
      const details = document.createElement("span");
      details.textContent = (source.collectionItem || "School fees") +
        " · Original credit " + money(source.originalUnallocatedUgx) +
        " · Already applied " + money(source.allocatedCreditUgx);
      const remaining = document.createElement("b");
      remaining.textContent = "Available " + money(source.remainingCreditUgx);
      card.append(receipt, details, remaining);
      list.append(card);

      const option = document.createElement("option");
      option.value = source.paymentId;
      option.textContent = source.receiptNumber + " · Available " + money(source.remainingCreditUgx);
      select.append(option);
    }
    if (pendingCreditSubmission && pendingCreditSubmission.body &&
        pendingCreditSubmission.learnerId === activeLearnerId &&
        !creditSources.some(source => source.paymentId === pendingCreditSubmission.body.sourcePaymentId)) {
      const option = document.createElement("option");
      option.value = pendingCreditSubmission.body.sourcePaymentId;
      option.textContent = "Pending allocation — retry original request";
      select.append(option);
    }
    form.hidden = false;
    renderCreditAllocationLines();
    if (pendingCreditSubmission && pendingCreditSubmission.body &&
        pendingCreditSubmission.learnerId === activeLearnerId) {
      restorePendingCreditForm();
    } else {
      updateCreditSummary();
    }
  }

  function restorePendingCreditForm() {
    if (!pendingCreditSubmission || !pendingCreditSubmission.body ||
        pendingCreditSubmission.learnerId !== activeLearnerId) return;
    const body = pendingCreditSubmission.body;
    byId("credit-source-select").value = body.sourcePaymentId;
    byId("credit-reason").value = body.reason;
    const amounts = new Map(body.allocations.map(item => [item.feeObligationId, item.amountUgx]));
    byId("credit-allocation-lines").querySelectorAll(".credit-allocation-amount").forEach(input => {
      if (amounts.has(input.dataset.feeId)) input.value = String(amounts.get(input.dataset.feeId));
      input.disabled = true;
    });
    byId("credit-source-select").disabled = true;
    byId("credit-reason").disabled = true;
    byId("credit-allocation-button").textContent = "Retry pending credit allocation";
    showMessage("credit-message", "A previous credit request is awaiting confirmation. Retry it with the saved details and same request key; do not create a new allocation.");
    updateCreditSummary();
  }

  async function loadLearnerCredits(learnerId) {
    if (!canAllocateCredits) return;
    try {
      if (pendingCreditSubmission && pendingCreditSubmission.learnerId === learnerId) {
        const status = await request("/finance/credits/allocations/" + encodeURIComponent(pendingCreditSubmission.key));
        if (status.allocation) {
          pendingCreditSubmission = null;
          savePendingCreditSubmission(null);
          showMessage("credit-message", "The earlier retained-credit request was already recorded. Refreshing the learner account.");
          await loadLearner(learnerId);
          return;
        }
      }
      const result = await request("/finance/learners/" + encodeURIComponent(learnerId) + "/credits");
      creditSources = Array.isArray(result.credits) ? result.credits : [];
      renderCreditSources();
      if (pendingCreditSubmission && pendingCreditSubmission.learnerId === learnerId && !pendingCreditSubmission.body) {
        showMessage("credit-message", "A request key was recovered from an earlier browser session, but its financial details were not saved. Re-enter the same source receipt, fee amounts and reason to retry safely with that key. If you cannot confirm the exact details, ask a supervisor before proceeding.", "error");
      } else if (creditSources.length) {
        showMessage("credit-message", "Retained credit is available for this learner. Each application is recorded in the finance audit trail.");
      } else {
        showMessage("credit-message", "No retained credit is currently available.");
      }
    } catch (error) {
      creditSources = [];
      renderCreditSources();
      showMessage("credit-message", "Could not confirm the previous credit request status. Do not create a new allocation until the local service is available. " + error.message, "error");
    }
  }

  byId("credit-source-select").addEventListener("change", updateCreditSummary);

  byId("credit-allocation-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (!canAllocateCredits || !activeLearnerId) return;
    const retrying = Boolean(pendingCreditSubmission && pendingCreditSubmission.body);
    if (!pendingCreditSubmission || !pendingCreditSubmission.body) {
      const source = selectedCreditSource();
      const reason = byId("credit-reason").value.trim();
      const allocations = [];
      byId("credit-allocation-lines").querySelectorAll(".credit-allocation-amount").forEach(input => {
        const amountUgx = Number(input.value);
        if (Number.isSafeInteger(amountUgx) && amountUgx > 0) {
          allocations.push({ feeObligationId: input.dataset.feeId, amountUgx });
        }
      });
      const totals = updateCreditSummary();
      if (!source) {
        showMessage("credit-message", "Select a receipt containing retained credit.", "error");
        return;
      }
      if (!allocations.length) {
        showMessage("credit-message", "Enter an amount for at least one outstanding fee balance.", "error");
        return;
      }
      if (totals.total > totals.available) {
        showMessage("credit-message", "The selected allocation exceeds the available retained credit.", "error");
        return;
      }
      if (reason.length < 5 || reason.length > 300) {
        showMessage("credit-message", "Enter a reason between 5 and 300 characters.", "error");
        return;
      }
      pendingCreditSubmission = {
        key: pendingCreditSubmission?.key || crypto.randomUUID(),
        learnerId: activeLearnerId,
        body: { sourcePaymentId: source.paymentId, allocations, reason }
      };
      savePendingCreditSubmission(pendingCreditSubmission);
    }
    const button = byId("credit-allocation-button");
    button.disabled = true;
    showMessage("credit-message", retrying
      ? "Retrying the exact previous credit allocation with its original request key…"
      : "Applying retained credit…");
    try {
      await request("/finance/credits/allocate", {
        method: "POST",
        body: pendingCreditSubmission.body,
        idempotencyKey: pendingCreditSubmission.key
      });
      pendingCreditSubmission = null;
      savePendingCreditSubmission(null);
      byId("credit-reason").value = "";
      byId("credit-source-select").disabled = false;
      byId("credit-reason").disabled = false;
      byId("credit-allocation-button").textContent = "Apply retained credit";
      const learnerToRefresh = activeLearnerId;
      await loadLearner(learnerToRefresh);
      showMessage("credit-message", "Retained credit applied successfully. The original payment and receipt remain unchanged.", "success");
    } catch (error) {
      if (error.status === 409 && pendingCreditSubmission) {
        try {
          const status = await request("/finance/credits/allocations/" + encodeURIComponent(pendingCreditSubmission.key));
          if (status.allocation) {
            pendingCreditSubmission = null;
            savePendingCreditSubmission(null);
            await loadLearner(activeLearnerId);
            showMessage("credit-message", "The earlier request was already recorded. The learner account has been refreshed.", "success");
            return;
          }
          pendingCreditSubmission.body = null;
          savePendingCreditSubmission(pendingCreditSubmission);
          showMessage("credit-message", "The server has no completed allocation for this request key. Check the source receipt, fee amounts and reason, then retry using the same key.", "error");
        } catch {
          showMessage("credit-message", "The allocation result is not yet confirmed. Do not start a new allocation; check the local service and retry the status check.", "error");
        }
      } else {
        showMessage("credit-message",
          error.message + (pendingCreditSubmission ? " Retry will reuse the exact same request safely." : ""),
          "error");
        if (error.status && error.status >= 400 && error.status < 500) {
          pendingCreditSubmission = null;
          savePendingCreditSubmission(null);
          byId("credit-source-select").disabled = false;
          byId("credit-reason").disabled = false;
          byId("credit-allocation-button").textContent = "Apply retained credit";
        }
      }
    } finally {
      button.disabled = false;
    }
  });

  byId("payment-form").addEventListener("submit", async event => {
    event.preventDefault();
    updateAllocationSummary();
    if (byId("post-payment-button").disabled) return;
    const retrying = Boolean(pendingSubmission || recoveredIdempotencyKey);
    if (!pendingSubmission) {
      const amountUgx = Number(byId("amount-received").value);
      const allocations = [];
      document.querySelectorAll(".fee-row").forEach(row => {
        if (row.querySelector(".fee-select")?.checked) {
          allocations.push({
            feeObligationId: row.dataset.feeId,
            amountUgx: Number(row.querySelector(".fee-allocation").value)
          });
        }
      });
      pendingSubmission = {
        key: recoveredIdempotencyKey || crypto.randomUUID(),
        body: {
          learnerId: activeLearnerId,
          amountUgx,
          paymentMethod: byId("payment-method").value,
          mobileMoneyProvider: byId("payment-method").value === "mobile_money" ? byId("mobile-provider").value : null,
          allocations,
          payerName: byId("payer-name").value.trim(),
          collectionItem: byId("collection-item").value,
          externalReference: byId("external-reference").value.trim(),
          notes: byId("payment-notes").value.trim()
        }
      };
      recoveredIdempotencyKey = pendingSubmission.key;
      saveRecoveredPaymentKey(recoveredIdempotencyKey);
    }
    const button = byId("post-payment-button");
    button.disabled = true;
    setPaymentFormLocked(true);
    showMessage("payment-message", retrying
      ? "Retrying the previous payment with its original details and request key…"
      : "Submitting payment… Do not close this page until a result is shown.");
    try {
      const result = await request("/finance/payments", {
        method: "POST", body: pendingSubmission.body, idempotencyKey: pendingSubmission.key
      });
      pendingSubmission = null;
      recoveredIdempotencyKey = null;
      saveRecoveredPaymentKey(null);
      setPaymentFormLocked(false);
      showMessage("payment-message", "Payment posted successfully and receipt issued.", "success");
      const learnerToRefresh = activeLearnerId;
      await loadLearner(learnerToRefresh);
      renderReceipt(result.payment);
    } catch (error) {
      showMessage("payment-message",
        error.message + (pendingSubmission ? " Retrying will resend the same payment request safely." : ""),
        "error");
      if (error.status && error.status >= 400 && error.status < 500 && error.status !== 409) {
        pendingSubmission = null;
        recoveredIdempotencyKey = null;
        saveRecoveredPaymentKey(null);
        setPaymentFormLocked(false);
      }
    } finally {
      button.disabled = false;
      updateAllocationSummary();
    }
  });

  byId("reprint-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (!canReprintReceipts) {
      showMessage("reprint-message", "Your staff account does not have receipt reprint permission.", "error");
      return;
    }
    const receiptNumber = byId("reprint-number").value.trim();
    const reason = byId("reprint-reason").value.trim();
    if (!/^CR-[0-9]{4}-[0-9]{7}$/.test(receiptNumber) || reason.length < 5 || reason.length > 300) {
      showMessage("reprint-message", "Enter a valid receipt number and a reason of 5 to 300 characters.", "error");
      return;
    }
    const button = byId("reprint-button");
    button.disabled = true;
    showMessage("reprint-message", "Checking receipt and recording the reprint…");
    try {
      const result = await request("/finance/receipts/" + encodeURIComponent(receiptNumber) + "/reprint", {
        method: "POST",
        body: { reason }
      });
      byId("reprint-reason").value = "";
      renderReceipt(result.receipt);
      showMessage("reprint-message", "Reprint recorded in the finance audit log. Use Print receipt to print this copy.", "success");
    } catch (error) {
      showMessage("reprint-message", error.message, "error");
    } finally {
      button.disabled = false;
    }
  });

  byId("print-receipt").addEventListener("click", () => window.print());
  initialise();
})();
