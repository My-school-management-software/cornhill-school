(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  let principal = null;
  let verifiedLearnerCode = null;
  let verifiedGuardianPhone = null;
  const registeredPhone = input => {
    if (typeof input !== "string") return null;
    const value = input.replace(/\s+/g, "").trim();
    const normalized = /^0[0-9]{9}$/.test(value) ? "+256" + value.slice(1) :
      /^256[0-9]{9}$/.test(value) ? "+" + value : value;
    return /^\+256[0-9]{9}$/.test(normalized) ? normalized : null;
  };
  function resetEntry() {
    verifiedLearnerCode = null;
    verifiedGuardianPhone = null;
    $("login-form").hidden = false;
    $("pin-form").hidden = true;
    $("pin").value = "";
  }
  const csrf = () => {
    const prefix = "__Host-cornhill_csrf=";
    const value = document.cookie.split(";").map(part => part.trim()).find(part => part.startsWith(prefix));
    return value ? decodeURIComponent(value.slice(prefix.length)) : "";
  };
  async function api(path, { method = "GET", body } = {}) {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET" && csrf()) headers["X-Cornhill-CSRF"] = csrf();
    const response = await fetch("/api/v1" + path, {
      method, headers, credentials: "same-origin", cache: "no-store",
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || "The guardian request could not be completed.");
    return data;
  }
  function notice(message, bad = false) {
    $("notice").textContent = message;
    $("notice").className = "notice" + (bad ? " error" : "");
  }
  function ageFrom(value) {
    if (!value) return "Not recorded";
    const birth = new Date(String(value).slice(0, 10) + "T00:00:00");
    if (!Number.isFinite(birth.getTime())) return "Not recorded";
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const beforeBirthday = today.getMonth() < birth.getMonth() ||
      (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
    if (beforeBirthday) age -= 1;
    return age < 0 ? "Not recorded" : age + (age === 1 ? " year" : " years");
  }
  function addDetail(list, label, value) {
    const item = document.createElement("div");
    item.className = "detail";
    const name = document.createElement("span");
    name.textContent = label;
    const text = document.createElement("strong");
    text.textContent = value == null || value === "" ? "Not recorded" : String(value);
    item.append(name, text);
    list.append(item);
  }
  function renderLearners(learners) {
    const host = $("learner-list");
    host.replaceChildren();
    if (!learners.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No learner profiles have been approved for this guardian account yet. Please contact the school office.";
      host.append(empty);
      return;
    }
    for (const learner of learners) {
      const card = document.createElement("article");
      card.className = "learner-card";
      const heading = document.createElement("div");
      heading.className = "learner-heading";
      const identity = document.createElement("div");
      const name = document.createElement("h3");
      name.textContent = [learner.firstName, learner.middleName, learner.lastName].filter(Boolean).join(" ");
      const code = document.createElement("p");
      code.className = "pupil-code";
      code.textContent = "Pupil code · " + (learner.pupilCode || "Not recorded");
      identity.append(name, code);
      const classTag = document.createElement("span");
      classTag.className = "class-tag";
      classTag.textContent = [learner.className, learner.stream].filter(Boolean).join(" · ") || "Class not assigned";
      heading.append(identity, classTag);
      const details = document.createElement("div");
      details.className = "details";
      addDetail(details, "LIN", learner.lin);
      addDetail(details, "Date of birth", learner.dateOfBirth);
      addDetail(details, "Age", ageFrom(learner.dateOfBirth));
      addDetail(details, "Learner type", learner.learnerType);
      addDetail(details, "Admission date", learner.admissionDate);
      addDetail(details, "Status", learner.status);
      card.append(heading, details);
      host.append(card);
    }
  }
  async function loadPortal() {
    if (!verifiedLearnerCode) throw new Error("First verify the learner's code and registered parent or guardian phone.");
    const result = await api("/guardian/learners?pupilCode=" +
      encodeURIComponent(verifiedLearnerCode));
    if (!Array.isArray(result.learners)) throw new Error("The guardian learner response was incomplete.");
    renderLearners(result.learners);
    $("guardian-name").textContent = principal?.displayName || "Guardian";
    $("login-panel").hidden = true;
    $("portal-panel").hidden = false;
    notice("Secure guardian session active. Learner information is read-only.");
  }
  async function enterGuardianSession(currentPrincipal) {
    if (currentPrincipal?.principalType !== "guardian" || currentPrincipal.accountStatus !== "active") {
      throw new Error("This portal is available only to an active guardian account.");
    }
    principal = currentPrincipal;
    await loadPortal();
  }
  $("login-form").addEventListener("submit", async event => {
    event.preventDefault();
    const pupilCode = $("pupil-code").value.trim().toUpperCase();
    const phone = registeredPhone($("phone").value);
    if (!/^[A-Z0-9-]{3,30}$/.test(pupilCode) || !phone) {
      notice("Enter the learner's CORNHILL code and their registered Ugandan parent or guardian number.", true);
      return;
    }
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const result = await api("/guardian/entry-check", {
        method: "POST", body: { pupilCode, phone }
      });
      if (result.verified !== true) {
        throw new Error("The learner code and registered number could not be confirmed.");
      }
      verifiedLearnerCode = pupilCode;
      verifiedGuardianPhone = phone;
      $("login-form").hidden = true;
      $("pin-form").hidden = false;
      $("pin").value = "";
      notice("Learner code and registered phone confirmed. Enter the guardian PIN issued by the school office. If none has been issued, contact the office.");
    } catch (error) {
      resetEntry();
      notice(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
  $("pin-form").addEventListener("submit", async event => {
    event.preventDefault();
    const pin = $("pin").value.trim();
    if (!verifiedLearnerCode || !verifiedGuardianPhone || !/^[0-9]{8}$/.test(pin)) {
      notice("Verify the learner code and registered number first, then enter the eight-digit PIN.", true);
      return;
    }
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const result = await api("/auth/guardian/login", {
        method: "POST", body: { phone: verifiedGuardianPhone, pin }
      });
      $("pin").value = "";
      await enterGuardianSession(result.principal);
    } catch (error) {
      $("pin").value = "";
      notice(error.message + " If your PIN has not been issued, contact the school office.", true);
    } finally {
      button.disabled = false;
    }
  });
  $("change-details").addEventListener("click", () => {
    resetEntry();
    notice("Enter the learner code and registered guardian number again.");
  });
  $("sign-out").addEventListener("click", async () => {
    try { await api("/auth/logout", { method: "POST", body: {} }); } catch {}
    principal = null;
    $("portal-panel").hidden = true;
    $("login-panel").hidden = false;
    $("learner-list").replaceChildren();
    resetEntry();
    $("pupil-code").value = "";
    $("phone").value = "";
    notice("You have signed out.");
  });
  (async () => {
    try {
      const result = await api("/auth/session");
      // An existing guardian session never bypasses the explicit learner
      // code and registered-phone step for this portal visit.
      if (result.principal?.principalType === "guardian") {
        principal = result.principal;
      }
      resetEntry();
      $("login-panel").hidden = false;
      $("portal-panel").hidden = true;
      notice("Begin with the learner code and registered parent or guardian phone number.");
    } catch {
      resetEntry();
      $("login-panel").hidden = false;
      notice("Begin with the learner code and registered parent or guardian phone number.");
    }
  })();
})();
