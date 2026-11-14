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
  const PENDING_PAYMENT_RECOVERY_STORAGE = "cornhill.finance.pending-payment-recovery";
  const PENDING_CREDIT_STORAGE = "cornhill.finance.pending-credit-allocation";
  const PENDING_CREDIT_KEY_STORAGE = "cornhill.finance.pending-credit-key";
  let currentStaffId = null;
  let canManageExpenseLimits = false;
  function readRecoveredPaymentKey(actorStaffId) {
    const suffix = ":" + actorStaffId;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    try {
      const raw = sessionStorage.getItem(PENDING_KEY_STORAGE + suffix);
      if (raw) {
        const value = JSON.parse(raw);
        if (value && uuid.test(value.key || "") && uuid.test(value.learnerId || "")) return value;
        sessionStorage.removeItem(PENDING_KEY_STORAGE + suffix);
      }
      const legacy = sessionStorage.getItem(PENDING_KEY_STORAGE);
      if (uuid.test(legacy || "")) return { key: legacy, learnerId: null, legacy: true };
      const saved = localStorage.getItem(PENDING_PAYMENT_RECOVERY_STORAGE + suffix);
      if (!saved) return null;
      const value = JSON.parse(saved);
      return value && uuid.test(value.key || "") && uuid.test(value.learnerId || "") ? value : null;
    } catch { return null; }
  }
  function saveRecoveredPaymentKey(value, learnerId) {
    const suffix = currentStaffId ? ":" + currentStaffId : "";
    try {
      if (value) {
        const record = { key: value, learnerId };
        sessionStorage.setItem(PENDING_KEY_STORAGE + suffix, JSON.stringify(record));
        localStorage.setItem(PENDING_PAYMENT_RECOVERY_STORAGE + suffix, JSON.stringify(record));
        recoveredPaymentRequest = record;
      } else {
        sessionStorage.removeItem(PENDING_KEY_STORAGE + suffix);
        sessionStorage.removeItem(PENDING_KEY_STORAGE);
        localStorage.removeItem(PENDING_PAYMENT_RECOVERY_STORAGE + suffix);
        recoveredPaymentRequest = null;
      }
    } catch { /* Do not persist payment details; server-side idempotency remains authoritative. */ }
  }
  let recoveredPaymentRequest = null;
  let recoveredIdempotencyKey = null;

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
    const allowed = ["finance.payments_record","finance.expenses_request","finance.expenses_manage",
      "finance.expenses_review","finance.expenses_post","finance.banking_manage",
      "finance.banking_review","finance.banking_verify"];
    return (principal.roles || []).some(role =>
      Array.isArray(principal.rolePermissions?.[role]) &&
      allowed.some(permission => principal.rolePermissions[role].includes(permission))
    );
  }

  function hasPermission(principal, code) {
    return (principal.roles || []).some(role =>
      Array.isArray(principal.rolePermissions?.[role]) && principal.rolePermissions[role].includes(code)
    );
  }

  async function loadOperationsLookups({canRequestExpenses,canManageBanking,canManageExpenseLimits}) {
    const [categories, accounts, limitStaff] = await Promise.all([
      canRequestExpenses ? request("/finance/expense-categories") : Promise.resolve({items:[]}),
      canManageBanking ? request("/finance/bank-accounts") : Promise.resolve({items:[]}),
      canManageExpenseLimits ? request("/finance/expenses/limit-staff") : Promise.resolve({items:[]})
    ]);
    const categorySelect = byId("expense-category");
    categorySelect.replaceChildren();
    for (const item of categories.items || []) {
      const option = document.createElement("option");
      option.value = item.id; option.textContent = item.name;
      categorySelect.append(option);
    }
    const accountSelect = byId("bank-account-select");
    accountSelect.replaceChildren();
    for (const item of accounts.items || []) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.bankName + " · " + item.accountName + " · •••• " + item.last4;
      accountSelect.append(option);
    }
    if (!categorySelect.options.length) categorySelect.add(new Option("No active categories available", ""));
    if (!accountSelect.options.length) accountSelect.add(new Option("Register a bank account first", ""));
    const staffSelect=byId("expense-limit-staff");
    staffSelect.replaceChildren();
    for(const item of limitStaff.items||[]){const option=document.createElement("option");option.value=item.staffId;option.textContent=item.legalName+" · "+item.staffNumber+" · "+item.jobTitle+(item.limitIsActive?" · current "+money(item.dailyLimitUgx):" · no limit set");option.dataset.dailyLimit=item.limitIsActive?String(item.dailyLimitUgx):"";staffSelect.append(option);}
    if(!staffSelect.options.length)staffSelect.add(new Option("No active staff accounts available",""));
  }

  async function refreshOperationsLookups({canRequestExpenses=true,canManageBanking=true,canManageExpenseLimits:canManageLimits=canManageExpenseLimits}={}) {
    try { await loadOperationsLookups({canRequestExpenses,canManageBanking,canManageExpenseLimits:canManageLimits}); }
    catch (error) {
      showMessage("expense-request-message", "Finance lookup data could not be loaded: " + error.message, "error");
      showMessage("bank-transaction-message", "Bank accounts could not be loaded: " + error.message, "error");
    }
  }

  function showLogin(message = "") {
    byId("workspace").hidden = true;
    byId("login-panel").hidden = false;
    byId("learner-panel").hidden = true;
    byId("receipt-panel").hidden = true;
    showMessage("login-message", message, message ? "error" : "");
  }

  const financeQueuePermissions = {expenseReview:false,expensePost:false,bankReview:false,bankVerify:false};
  function queueButton(label, action, disabled=false) {
    const button=document.createElement("button");
    button.type="button";button.className="button secondary";button.textContent=label;button.disabled=disabled;
    button.addEventListener("click",action);return button;
  }
  function renderFinanceQueue(containerId,items,kind) {
    const container=byId(containerId);container.replaceChildren();
    if(!items.length){const empty=document.createElement("p");empty.className="muted";empty.textContent="No requests are waiting in this queue.";container.append(empty);return;}
    for(const item of items){
      const card=document.createElement("article");card.className="finance-review-item";
      const heading=document.createElement("strong");
      heading.textContent=kind==="expense"?(item.requestNumber+" · "+item.categoryName):(item.bankName+" · "+item.accountName+" · •••• "+item.last4);
      const details=document.createElement("p");details.textContent=money(item.amountUgx)+" · "+(kind==="expense"?"Expense":item.transactionType)+" · "+item.status+" · "+(kind==="expense"?item.expenseDate:item.transactionDate);
      const description=document.createElement("p");description.textContent=item.description;
      card.append(heading,details,description);
      if(item.externalReference){const reference=document.createElement("p");reference.className="muted";reference.textContent="Reference: "+item.externalReference;card.append(reference);}
      const controls=document.createElement("div");controls.className="finance-review-actions";
      const id=item.id;
      const prefix=kind==="expense"?"/finance/expenses/":"/finance/bank-transactions/";
      const messageId=kind==="expense"?"expense-review-message":"bank-review-message";
      if(item.status==="Pending" && (kind==="expense"?financeQueuePermissions.expenseReview:financeQueuePermissions.bankReview)){
        const note=document.createElement("input");note.type="text";note.maxLength=500;note.placeholder="Review note (required when rejecting)";note.setAttribute("aria-label","Review note");
        controls.append(note);
        controls.append(queueButton("Approve",()=>runFinanceQueueAction(messageId,async()=>{
          await request(prefix+id+"/review",{method:"POST",body:{decision:"Approved",note:note.value.trim()||null}});
        })));
        controls.append(queueButton("Reject",()=>{
          if(note.value.trim().length<5){showMessage(messageId,"Enter a reason of at least five characters before rejecting.","error");return;}
          runFinanceQueueAction(messageId,async()=>{await request(prefix+id+"/review",{method:"POST",body:{decision:"Rejected",note:note.value.trim()}});});
        }));
      }
      if(item.status==="Pending"||item.status==="Approved"){
        if(kind==="expense"?financeQueuePermissions.expenseReview:financeQueuePermissions.bankReview){
          const evidence=document.createElement("input");evidence.type="text";evidence.maxLength=36;evidence.pattern="[0-9a-fA-F-]{36}";evidence.placeholder="Evidence request ID (UUID)";evidence.value=item.evidenceRequestId||"";
          evidence.setAttribute("aria-label","Evidence request ID");
          controls.append(evidence);
          controls.append(queueButton(item.evidenceRequestId?"Update evidence link":"Attach evidence",()=>{
            if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(evidence.value.trim())){
              showMessage(messageId,"Enter a valid evidence request ID.","error");return;
            }
            runFinanceQueueAction(messageId,async()=>{await request(prefix+id+"/evidence",{method:"POST",body:{evidenceRequestId:evidence.value.trim()}});});
          }));
        }
        if(item.status==="Approved"&&kind==="expense"&&financeQueuePermissions.expensePost){
          controls.append(queueButton("Post expense",()=>runFinanceQueueAction(messageId,async()=>{
            await request(prefix+id+"/post",{method:"POST",body:{}});
          })));
        }
        if(item.status==="Approved"&&kind==="bank"&&financeQueuePermissions.bankVerify){
          controls.append(queueButton("Verify transaction",()=>runFinanceQueueAction(messageId,async()=>{
            await request(prefix+id+"/verify",{method:"POST",body:{}});
          })));
        }
        const evidenceState=document.createElement("p");evidenceState.className="muted";
        evidenceState.textContent=item.evidenceRequestId?"Evidence request linked. Final posting requires that evidence to be approved.":"Evidence is not linked; attach the matching evidence request before final posting.";
        card.append(evidenceState);
      }
      if(controls.childNodes.length)card.append(controls);
      container.append(card);
    }
  }
  async function runFinanceQueueAction(messageId,action) {
    try{await action();showMessage(messageId,"Finance action completed.","success");await refreshFinanceQueues();}
    catch(error){showMessage(messageId,error.message,"error");}
  }
  async function refreshFinanceQueues() {
    const expensePanel=byId("expense-review-panel"),bankPanel=byId("bank-review-panel");
    const tasks=[];
    if(financeQueuePermissions.expenseReview||financeQueuePermissions.expensePost){
      tasks.push(request("/finance/expense-review-queue").then(data=>renderFinanceQueue("expense-review-queue",data.items||[],"expense")).catch(error=>showMessage("expense-review-message",error.message,"error")));
    }
    if(financeQueuePermissions.bankReview||financeQueuePermissions.bankVerify){
      tasks.push(request("/finance/bank-review-queue").then(data=>renderFinanceQueue("bank-review-queue",data.items||[],"bank")).catch(error=>showMessage("bank-review-message",error.message,"error")));
    }
    await Promise.all(tasks);
  }

  async function establishSession(principal) {
    if (!permissionGranted(principal)) {
      showLogin("Your staff account does not currently have permission to record school payments. Contact the authorised school administrator.");
      return;
    }
    byId("login-panel").hidden = true;
    byId("workspace").hidden = false;
    const canRecordPayments = hasPermission(principal, "finance.payments_record");
    byId("payment-search-panel").hidden = !canRecordPayments;
    byId("learner-panel").hidden = true;
    byId("receipt-panel").hidden = true;
    currentStaffId = principal.id;
    recoveredPaymentRequest = readRecoveredPaymentKey(currentStaffId);
    recoveredIdempotencyKey = recoveredPaymentRequest?.key || null;
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
    const canRequestExpenses = hasPermission(principal, "finance.expenses_request");
    const canManageBanking = hasPermission(principal, "finance.banking_manage");
    canManageExpenseLimits = hasPermission(principal, "finance.expenses_manage");
    byId("expense-banking-workspace").hidden = !(canRequestExpenses || canManageBanking || canManageExpenseLimits);
    byId("expense-limit-form").hidden = !canManageExpenseLimits;
    byId("expense-request-form").hidden = !canRequestExpenses;
    byId("bank-account-form").hidden = !canManageBanking;
    byId("bank-transaction-form").hidden = !canManageBanking;
    financeQueuePermissions.expenseReview=hasPermission(principal,"finance.expenses_review");
    financeQueuePermissions.expensePost=hasPermission(principal,"finance.expenses_post");
    financeQueuePermissions.bankReview=hasPermission(principal,"finance.banking_review");
    financeQueuePermissions.bankVerify=hasPermission(principal,"finance.banking_verify");
    byId("finance-review-workspace").hidden=!(financeQueuePermissions.expenseReview||financeQueuePermissions.expensePost||financeQueuePermissions.bankReview||financeQueuePermissions.bankVerify);
    byId("expense-review-panel").hidden=!(financeQueuePermissions.expenseReview||financeQueuePermissions.expensePost);
    byId("bank-review-panel").hidden=!(financeQueuePermissions.bankReview||financeQueuePermissions.bankVerify);
    if (canRequestExpenses || canManageBanking || canManageExpenseLimits) await refreshOperationsLookups({canRequestExpenses,canManageBanking,canManageExpenseLimits});
    if (!byId("finance-review-workspace").hidden) await refreshFinanceQueues();
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
    canManageExpenseLimits = false;
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
    if (pendingSubmission ||
        (recoveredPaymentRequest?.learnerId && learnerId !== recoveredPaymentRequest.learnerId) ||
        (pendingCreditSubmission && learnerId !== pendingCreditSubmission.learnerId)) {
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
      if (recoveredPaymentRequest && recoveredPaymentRequest.learnerId === learnerId) {
        byId("post-payment-button").disabled = true;
        byId("pending-note").hidden = false;
        byId("pending-note").textContent = "Checking whether the earlier payment request was already posted…";
        const status = await request("/finance/payments/requests/" + encodeURIComponent(recoveredPaymentRequest.key));
        if (status.payment) {
          const recoveredPayment = status.payment;
          recoveredIdempotencyKey = null;
          pendingSubmission = null;
          saveRecoveredPaymentKey(null);
          await loadLearner(learnerId);
          renderReceipt(recoveredPayment);
          showMessage("payment-message", "The earlier payment was already posted. Its original receipt has been recovered without posting a second payment.", "success");
          return;
        }
        byId("post-payment-button").disabled = false;
      }
      if (canAllocateCredits) await loadLearnerCredits(learnerId);
      byId("payment-form").reset();
      if (recoveredIdempotencyKey) {
        byId("pending-note").hidden = false;
        byId("pending-note").textContent = "A payment request key is awaiting confirmation. Re-enter the exact same payment details for this learner to safely check or retry it. The key is retained without storing payment details in persistent browser storage.";
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
      saveRecoveredPaymentKey(recoveredIdempotencyKey, activeLearnerId);
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
      recoveredPaymentRequest = null;
      saveRecoveredPaymentKey(null);
      setPaymentFormLocked(false);
      showMessage("payment-message", "Payment posted successfully and receipt issued.", "success");
      const learnerToRefresh = activeLearnerId;
      await loadLearner(learnerToRefresh);
      renderReceipt(result.payment);
    } catch (error) {
      if (error.status === 409 && recoveredIdempotencyKey) {
        try {
          const status = await request("/finance/payments/requests/" + encodeURIComponent(recoveredIdempotencyKey));
          if (status.payment) {
            const recoveredPayment = status.payment;
            pendingSubmission = null;
            recoveredIdempotencyKey = null;
            recoveredPaymentRequest = null;
            saveRecoveredPaymentKey(null);
            setPaymentFormLocked(false);
            await loadLearner(activeLearnerId);
            renderReceipt(recoveredPayment);
            showMessage("payment-message", "The earlier payment was already posted. Its original receipt has been recovered.", "success");
            return;
          }
          pendingSubmission = null;
          setPaymentFormLocked(false);
          showMessage("payment-message", "No completed payment was found for this request key. Check the details and retry using the same key; do not start a separate payment request.", "error");
        } catch {
          showMessage("payment-message", "The payment result is not yet confirmed. Do not create another payment. Check the local service and retry the status check.", "error");
        }
      } else {
        showMessage("payment-message",
          error.message + (pendingSubmission ? " Retrying will resend the same payment request safely." : ""),
          "error");
        if (error.status && error.status >= 400 && error.status < 500) {
          pendingSubmission = null;
          recoveredIdempotencyKey = null;
          saveRecoveredPaymentKey(null);
          setPaymentFormLocked(false);
        }
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

  byId("expense-limit-staff").addEventListener("change",()=>{const selected=byId("expense-limit-staff").selectedOptions[0];if(selected?.dataset.dailyLimit)byId("expense-daily-limit").value=selected.dataset.dailyLimit;});

  byId("expense-limit-form").addEventListener("submit",async event=>{
    event.preventDefault();const button=event.currentTarget.querySelector("button[type=submit]");const staffId=byId("expense-limit-staff").value;const dailyLimitUgx=Number(byId("expense-daily-limit").value);
    if(!staffId||!Number.isSafeInteger(dailyLimitUgx)||dailyLimitUgx<=0){showMessage("expense-limit-message","Select an active staff member and enter a positive whole-UGX daily limit.","error");return;}
    button.disabled=true;try{await request("/finance/expenses/limits",{method:"POST",body:{staffId,dailyLimitUgx}});showMessage("expense-limit-message","Daily expense limit saved. The selected staff member can now submit requests within this limit.","success");await refreshOperationsLookups({canRequestExpenses:false,canManageBanking:false,canManageExpenseLimits:true});}catch(error){showMessage("expense-limit-message",error.message,"error");}finally{button.disabled=false;}
  });

  byId("expense-request-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const result = await request("/finance/expenses", {method:"POST",body:{
        categoryId:byId("expense-category").value,
        description:byId("expense-description").value.trim(),
        amountUgx:Number(byId("expense-amount").value)
      }});
      byId("expense-description").value = ""; byId("expense-amount").value = "";
      showMessage("expense-request-message","Expense request submitted for independent review. Reference: "+result.result,"success");
    } catch(error) { showMessage("expense-request-message",error.message,"error"); }
    finally { button.disabled = false; }
  });

  byId("bank-account-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const result = await request("/finance/bank-accounts",{method:"POST",body:{
        accountName:byId("bank-account-name").value.trim(),bankName:byId("bank-name").value.trim(),
        last4:byId("bank-last4").value,openingBalanceUgx:Number(byId("bank-opening-balance").value)
      }});
      event.currentTarget.reset();
      showMessage("bank-account-message","Bank account registered. Reference: "+result.result,"success");
      await refreshOperationsLookups({canRequestExpenses:false,canManageBanking:true});
    } catch(error) { showMessage("bank-account-message",error.message,"error"); }
    finally { button.disabled = false; }
  });

  byId("bank-transaction-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const result = await request("/finance/bank-transactions",{method:"POST",body:{
        accountId:byId("bank-account-select").value,
        transactionType:byId("bank-transaction-type").value,
        amountUgx:Number(byId("bank-transaction-amount").value),
        description:byId("bank-transaction-description").value.trim(),
        externalReference:byId("bank-transaction-reference").value.trim() || null
      }});
      byId("bank-transaction-form").reset();
      showMessage("bank-transaction-message","Bank transaction submitted for independent review. Reference: "+result.result,"success");
    } catch(error) { showMessage("bank-transaction-message",error.message,"error"); }
    finally { button.disabled = false; }
  });

  byId("refresh-finance-queues").addEventListener("click", refreshFinanceQueues);

  byId("print-receipt").addEventListener("click", () => window.print());
  initialise();
})();
