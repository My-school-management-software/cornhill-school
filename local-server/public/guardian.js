(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  let principal = null;
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
    const result = await api("/guardian/learners");
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
    const phone = $("phone").value.trim();
    const pin = $("pin").value.trim();
    if (!/^\+256[0-9]{9}$/.test(phone) || !/^[0-9]{8}$/.test(pin)) {
      notice("Enter the registered Ugandan phone number and eight-digit guardian PIN.", true);
      return;
    }
    const button = event.currentTarget.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const result = await api("/auth/guardian/login", { method: "POST", body: { phone, pin } });
      $("pin").value = "";
      await enterGuardianSession(result.principal);
    } catch (error) {
      $("pin").value = "";
      notice(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
  $("sign-out").addEventListener("click", async () => {
    try { await api("/auth/logout", { method: "POST", body: {} }); } catch {}
    principal = null;
    $("portal-panel").hidden = true;
    $("login-panel").hidden = false;
    $("learner-list").replaceChildren();
    $("pin").value = "";
    notice("You have signed out.");
  });
  (async () => {
    try {
      const result = await api("/auth/session");
      await enterGuardianSession(result.principal);
    } catch {
      $("login-panel").hidden = false;
      notice("Please sign in with your registered guardian phone and PIN.");
    }
  })();
})();
