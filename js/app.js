(() => {
  "use strict";

  const supabase = window.vgSupabase;

  let currentUser = null;
  let currentProfile = null;
  let visiblePlans = [];
  let currentPlan = null;
  let currentBoard = [];
  let currentMembership = null;
  let currentProgress = 0;
  let requiredProgress = 0;
  let pendingApplication = null;
  let legendApplications = [];

  const $ = (selector) => document.querySelector(selector);

  function escapeHtml(value) {
    if (window.VG_UI?.escapeHtml) {
      return window.VG_UI.escapeHtml(value ?? "");
    }

    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
  }

  function points(value) {
    if (window.VG_UI?.formatPoints) {
      return window.VG_UI.formatPoints(value);
    }

    const number = Number(value);
    if (!Number.isFinite(number)) return "V$0";

    return `V$${new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits: 2
    }).format(number)}`;
  }

  function date(value) {
    if (window.VG_UI?.formatDate) {
      return window.VG_UI.formatDate(value);
    }

    if (!value) return "—";

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "—";

    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(parsed);
  }

  function notify(message, type = "info") {
    if (window.VG_UI?.notify) {
      window.VG_UI.notify(message, type);
      return;
    }

    alert(message);
  }

  function getErrorMessage(error) {
    const message = String(
      error?.message ||
      error?.error_description ||
      error ||
      "Une erreur est survenue."
    );

    const normalized = message.toLowerCase();

    if (normalized.includes("authentication required")) {
      return "Vous devez être connecté.";
    }

    if (normalized.includes("already has a plan")) {
      return "Vous avez déjà une inscription dans un niveau.";
    }

    if (normalized.includes("already belongs")) {
      return "Vous appartenez déjà à ce niveau.";
    }

    if (normalized.includes("application unavailable")) {
      return "Cette demande n'est plus disponible.";
    }

    if (normalized.includes("target slot is occupied")) {
      return "Cette position est déjà occupée.";
    }

    if (normalized.includes("only a legend")) {
      return "Seule une Légende du niveau concerné peut approuver cette demande.";
    }

    if (normalized.includes("self approval")) {
      return "Vous ne pouvez pas approuver votre propre demande.";
    }

    if (normalized.includes("referral code not found")) {
      return "Le code de parrainage est introuvable.";
    }

    if (normalized.includes("self referral")) {
      return "Vous ne pouvez pas utiliser votre propre code de parrainage.";
    }

    if (normalized.includes("plan is above")) {
      return "Ce niveau n'est pas encore accessible.";
    }

    if (normalized.includes("active legend not found")) {
      return "Aucune Légende active trouvée.";
    }

    if (normalized.includes("first plan table is full")) {
      return "La table du premier niveau est actuellement complète.";
    }

    if (normalized.includes("first plan unavailable")) {
      return "Le premier niveau n'est pas disponible actuellement.";
    }

    if (normalized.includes("no next plan")) {
      return "Aucun niveau supérieur n'est actuellement disponible.";
    }

    return message;
  }

  function showLoading(message = "Chargement...") {
    const loading = $("#dashboard-loading");

    if (loading) {
      loading.textContent = message;
      loading.hidden = false;
    }
  }

  function hideLoading() {
    const loading = $("#dashboard-loading");

    if (loading) {
      loading.hidden = true;
    }
  }

  function setText(selector, value) {
    const element = $(selector);

    if (element) {
      element.textContent = value ?? "";
    }
  }

  function setHTML(selector, value) {
    const element = $(selector);

    if (element) {
      element.innerHTML = value ?? "";
    }
  }

  function getFirstRow(data) {
    if (Array.isArray(data)) {
      return data[0] || null;
    }

    return data || null;
  }

  function normalizeRole(role) {
    if (role === "legend") return "Légende";
    if (role === "constructor") return "Constructeur";
    return "Membre";
  }

  function getMembershipFromBoard(board) {
    if (!Array.isArray(board)) return null;

    return (
      board.find(
        (member) =>
          member.user_id === currentUser?.id &&
          member.membership_status === "active"
      ) ||
      board.find((member) => member.user_id === currentUser?.id) ||
      null
    );
  }

  function getBoardPosition(member) {
    if (!member) return null;

    return (
      member.position_no ??
      member.position ??
      null
    );
  }

  async function loadProfile() {
    const { data, error } = await supabase.rpc("vg_get_my_profile");

    if (error) throw error;

    currentProfile = getFirstRow(data);

    if (!currentProfile) {
      throw new Error("Profil introuvable.");
    }

    renderProfile();
  }

  function renderProfile() {
    if (!currentProfile) return;

    setText("#profile-username", currentProfile.username || "—");
    setText("#profile-phone", currentProfile.phone || "—");
    setText("#profile-role", normalizeRole(currentProfile.role));

    const roleElements = document.querySelectorAll(
      "[data-profile-role]"
    );

    roleElements.forEach((element) => {
      element.textContent = normalizeRole(currentProfile.role);
    });

    const usernameElements = document.querySelectorAll(
      "[data-profile-username]"
    );

    usernameElements.forEach((element) => {
      element.textContent = currentProfile.username || "—";
    });
  }

  async function loadPlans() {
    const { data, error } = await supabase.rpc("vg_get_visible_plans");

    if (error) throw error;

    visiblePlans = Array.isArray(data)
      ? [...data].sort(
          (a, b) => Number(a.sequence_no) - Number(b.sequence_no)
        )
      : [];

    renderPlans();
  }

  function renderPlans() {
    const container =
      $("#plans-list") ||
      $(".plans-list") ||
      $("[data-plans-list]");

    if (!container) return;

    if (!visiblePlans.length) {
      container.innerHTML = `
        <div class="empty-state">
          Aucun niveau disponible pour le moment.
        </div>
      `;
      return;
    }

    container.innerHTML = visiblePlans
      .map((plan) => {
        const isCurrent =
          currentPlan &&
          plan.id === currentPlan.id;

        return `
          <article
            class="plan-card ${isCurrent ? "active" : ""}"
            data-plan-id="${escapeHtml(plan.id)}"
          >
            <div class="plan-card-header">
              <h3>${escapeHtml(plan.name || "Niveau")}</h3>
              <span class="plan-points">
                ${points(plan.plan_points)}
              </span>
            </div>

            <div class="plan-card-body">
              <p>
                Progression requise :
                <strong>${Number(plan.required_progress || 0)}</strong>
              </p>
            </div>
          </article>
        `;
      })
      .join("");
  }

  async function loadCurrentBoard() {
    currentBoard = [];
    currentPlan = null;
    currentMembership = null;

    const orderedPlans = [...visiblePlans].sort(
      (a, b) => Number(b.sequence_no) - Number(a.sequence_no)
    );

    for (const plan of orderedPlans) {
      try {
        const { data, error } = await supabase.rpc(
          "vg_get_board",
          {
            p_plan_id: plan.id
          }
        );

        if (error) continue;

        const board = Array.isArray(data) ? data : [];

        if (board.length) {
          currentPlan = plan;
          currentBoard = board;
          currentMembership = getMembershipFromBoard(board);
          break;
        }
      } catch {
        continue;
      }
    }

    if (!currentPlan) {
      renderEmptyBoard();
      return;
    }

    await loadCurrentProgress();
    renderCurrentPlan();
    renderBoard();
  }

  async function loadCurrentProgress() {
    currentProgress = 0;
    requiredProgress = 0;

    if (!currentMembership || !currentPlan) return;

    requiredProgress =
      currentProfile?.is_genesis === true
        ? 10
        : Number(currentPlan.required_progress || 0);

    const { data, error } = await supabase
      .from("vg_events")
      .select("id,membership_id,event_type,metadata,created_at")
      .eq("user_id", currentUser.id)
      .eq("membership_id", currentMembership.membership_id)
      .eq("event_type", "approval");

    if (error) {
      return;
    }

    const events = Array.isArray(data) ? data : [];

    currentProgress = events.filter((event) => {
      const metadata = event?.metadata;

      return (
        metadata &&
        metadata.source === "points_only_simulation"
      );
    }).length;
  }

  function renderCurrentPlan() {
    if (!currentPlan) return;

    setText(
      "#current-plan-name",
      currentPlan.name || "—"
    );

    setText(
      "#current-plan-amount",
      points(currentPlan.plan_points)
    );

    setText(
      "#current-plan-points",
      points(currentPlan.plan_points)
    );

    const required =
      currentProfile?.is_genesis === true
        ? 10
        : Number(currentPlan.required_progress || 0);

    requiredProgress = required;

    const progress = Math.min(
      Number(currentProgress || 0),
      required
    );

    setText(
      "#progress-count",
      String(progress)
    );

    setText(
      "#required-progress",
      String(required)
    );

    setText(
      "#progress-value",
      `${progress} / ${required}`
    );

    const percentage =
      required > 0
        ? Math.min(100, Math.round((progress / required) * 100))
        : 0;

    const progressBars = document.querySelectorAll(
      ".progress-fill, [data-progress-fill]"
    );

    progressBars.forEach((bar) => {
      bar.style.width = `${percentage}%`;
    });

    const progressTexts = document.querySelectorAll(
      "[data-progress-percent]"
    );

    progressTexts.forEach((element) => {
      element.textContent = `${percentage}%`;
    });

    const role =
      currentMembership?.member_role ||
      currentProfile?.role;

    const progressContainer =
      $("#simulation-progress-area") ||
      $("[data-simulation-progress]");

    if (progressContainer) {
      if (role === "legend") {
        progressContainer.hidden = false;

        progressContainer.innerHTML = `
          <div class="simulation-progress-card">
            <div>
              <strong>Progression de simulation</strong>
              <p>
                ${progress} / ${required} progression${required > 1 ? "s" : ""}
              </p>
            </div>

            <button
              type="button"
              id="simulation-progress-button"
              class="primary-button"
              ${progress >= required ? "disabled" : ""}
            >
              ${progress >= required
                ? "Progression terminée"
                : "Enregistrer une progression"}
            </button>
          </div>
        `;

        const button = $("#simulation-progress-button");

        if (button) {
          button.addEventListener(
            "click",
            recordSimulationProgress
          );
        }
      } else {
        progressContainer.hidden = true;
        progressContainer.innerHTML = "";
      }
    }

    renderNextPlanButton();
  }

  function renderNextPlanButton() {
    const container =
      $("#next-plan-area") ||
      $("[data-next-plan]");

    if (!container) return;

    const currentSequence = Number(
      currentPlan?.sequence_no || 0
    );

    const nextPlan = visiblePlans.find(
      (plan) =>
        Number(plan.sequence_no) === currentSequence + 1
    );

    if (!nextPlan) {
      container.innerHTML = "";
      return;
    }

    const progressComplete =
      currentProgress >=
      Number(
        currentProfile?.is_genesis
          ? 10
          : currentPlan?.required_progress || 0
      );

    if (!progressComplete) {
      container.innerHTML = `
        <div class="next-plan-info">
          <strong>${escapeHtml(nextPlan.name)}</strong>
          <p>
            Continuez votre progression pour débloquer le niveau suivant.
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="next-plan-card">
        <div>
          <strong>${escapeHtml(nextPlan.name)}</strong>
          <p>${points(nextPlan.plan_points)}</p>
        </div>

        <button
          type="button"
          id="apply-next-plan-button"
          class="primary-button"
        >
          Demander l'accès
        </button>
      </div>
    `;

    const button = $("#apply-next-plan-button");

    if (button) {
      button.addEventListener(
        "click",
        applyToNextPlan
      );
    }
  }

  function renderBoard() {
    const container =
      $("#board") ||
      $("#board-container") ||
      $(".board-container") ||
      $("[data-board]");

    if (!container) return;

    if (!currentBoard.length) {
      renderEmptyBoard();
      return;
    }

    const boardByPosition = new Map();

    currentBoard.forEach((member) => {
      boardByPosition.set(
        Number(member.position_no),
        member
      );
    });

    const nodes = [];

    for (let position = 1; position <= 11; position += 1) {
      const member = boardByPosition.get(position);

      nodes.push(
        renderBoardNode(
          member,
          position
        )
      );
    }

    container.innerHTML = `
      <div class="victory-board">
        ${nodes.join("")}
      </div>
    `;

    container
      .querySelectorAll("[data-public-profile]")
      .forEach((element) => {
        element.addEventListener(
          "click",
          () =>
            openPublicProfile(
              element.dataset.publicProfile
            )
        );
      });
  }

  function renderBoardNode(member, position) {
    if (!member) {
      return `
        <div
          class="board-node empty"
          data-position="${position}"
        >
          <span class="board-position">
            ${position}
          </span>

          <span class="board-node-label">
            Libre
          </span>
        </div>
      `;
    }

    const username =
      member.username ||
      (
        member.pending_application_id
          ? "Demande en attente"
          : "Membre"
      );

    const role = member.member_role
      ? normalizeRole(member.member_role)
      : "Membre";

    const isPending =
      !member.membership_id &&
      Boolean(member.pending_application_id);

    const statusClass =
      isPending ? "pending" : "occupied";

    const clickable =
      member.user_id && !isPending;

    return `
      <div
        class="board-node ${statusClass}"
        data-position="${position}"
      >
        <span class="board-position">
          ${position}
        </span>

        ${
          clickable
            ? `
              <button
                type="button"
                class="board-username"
                data-public-profile="${escapeHtml(
                  member.user_id
                )}"
              >
                ${escapeHtml(username)}
              </button>
            `
            : `
              <span class="board-node-label">
                ${escapeHtml(username)}
              </span>
            `
        }

        <span class="board-role">
          ${escapeHtml(role)}
        </span>

        ${
          isPending
            ? `
              <span class="board-pending">
                En attente
              </span>
            `
            : ""
        }
      </div>
    `;
  }

  function renderEmptyBoard() {
    const container =
      $("#board") ||
      $("#board-container") ||
      $(".board-container") ||
      $("[data-board]");

    if (!container) return;

    container.innerHTML = `
      <div class="empty-state">
        Vous n'avez pas encore de table active.
      </div>
    `;
  }

  async function loadMyPendingApplication() {
    pendingApplication = null;

    const { data, error } = await supabase
      .from("vg_applications")
      .select(`
        id,
        target_plan_id,
        target_division_id,
        target_table_id,
        target_position_no,
        status,
        expires_at,
        created_at
      `)
      .eq("user_id", currentUser.id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", {
        ascending: false
      })
      .limit(1);

    if (!error && Array.isArray(data) && data.length) {
      pendingApplication = data[0];
    }

    renderMyPendingApplication();
  }

  function renderMyPendingApplication() {
    const container =
      $("#pending-section") ||
      $("[data-pending-section]");

    if (!container) return;

    if (!pendingApplication) {
      container.hidden = true;
      return;
    }

    container.hidden = false;

    container.innerHTML = `
      <div class="pending-card">
        <strong>Demande en attente</strong>

        <p>
          Position demandée :
          <strong>
            ${Number(
              pendingApplication.target_position_no || 0
            )}
          </strong>
        </p>

        <p>
          Expiration :
          ${date(pendingApplication.expires_at)}
        </p>
      </div>
    `;
  }

  async function loadLegendApplications() {
    legendApplications = [];

    const role =
      currentMembership?.member_role ||
      currentProfile?.role;

    if (role !== "legend") {
      renderLegendApplications();
      return;
    }

    const { data, error } = await supabase.rpc(
      "vg_get_pending_for_legend"
    );

    if (!error && Array.isArray(data)) {
      legendApplications = data;
    }

    renderLegendApplications();
  }

  function renderLegendApplications() {
    const container =
      $("#approval-section") ||
      $("#pending-approvals") ||
      $("[data-approval-section]");

    if (!container) return;

    const role =
      currentMembership?.member_role ||
      currentProfile?.role;

    if (role !== "legend") {
      container.hidden = true;
      return;
    }

    container.hidden = false;

    if (!legendApplications.length) {
      container.innerHTML = `
        <div class="empty-state">
          Aucune demande en attente.
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="approval-list">
        ${legendApplications
          .map(
            (application) => `
              <article
                class="approval-card"
                data-application-id="${escapeHtml(
                  application.id
                )}"
              >
                <div>
                  <strong>
                    Nouvelle demande
                  </strong>

                  <p>
                    Position :
                    ${Number(
                      application.target_position_no || 0
                    )}
                  </p>

                  <small>
                    Expire le
                    ${date(application.expires_at)}
                  </small>
                </div>

                <button
                  type="button"
                  class="primary-button approve-application-button"
                  data-application-id="${escapeHtml(
                    application.id
                  )}"
                >
                  Approuver
                </button>
              </article>
            `
          )
          .join("")}
      </div>
    `;

    container
      .querySelectorAll(".approve-application-button")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            approveApplication(
              button.dataset.applicationId,
              button
            )
        );
      });
  }

  async function recordSimulationProgress() {
    if (!currentMembership?.membership_id) {
      notify(
        "Aucune adhésion active de Légende trouvée.",
        "error"
      );
      return;
    }

    const button = $("#simulation-progress-button");

    if (button) {
      button.disabled = true;
      button.textContent = "Enregistrement...";
    }

    try {
      const { data, error } = await supabase.rpc(
        "vg_record_simulation_progress",
        {
          p_legend_membership_id:
            currentMembership.membership_id
        }
      );

      if (error) throw error;

      const result = getFirstRow(data) || data;

      if (result?.completed) {
        notify(
          "La progression requise est terminée.",
          "success"
        );
      } else {
        notify(
          "Progression de simulation enregistrée.",
          "success"
        );
      }

      await refreshDashboard();
    } catch (error) {
      notify(
        getErrorMessage(error),
        "error"
      );

      if (button) {
        button.disabled = false;
        button.textContent =
          "Enregistrer une progression";
      }
    }
  }

  async function approveApplication(
    applicationId,
    button
  ) {
    if (!applicationId) return;

    if (button) {
      button.disabled = true;
      button.textContent = "Approbation...";
    }

    try {
      const { error } = await supabase.rpc(
        "vg_approve_application",
        {
          p_application_id: applicationId
        }
      );

      if (error) throw error;

      notify(
        "Demande approuvée. La progression de simulation a été enregistrée.",
        "success"
      );

      await refreshDashboard();
    } catch (error) {
      notify(
        getErrorMessage(error),
        "error"
      );

      if (button) {
        button.disabled = false;
        button.textContent = "Approuver";
      }
    }
  }

  async function applyToFirstPlan() {
    const button =
      $("#apply-first-plan-button") ||
      $("[data-apply-first-plan]");

    if (button) {
      button.disabled = true;
      button.textContent = "Traitement...";
    }

    try {
      const { error } = await supabase.rpc(
        "vg_apply_to_first_plan"
      );

      if (error) throw error;

      notify(
        "Votre demande pour le premier niveau a été créée.",
        "success"
      );

      await refreshDashboard();
    } catch (error) {
      notify(
        getErrorMessage(error),
        "error"
      );

      if (button) {
        button.disabled = false;
        button.textContent = "Commencer";
      }
    }
  }

  async function applyToNextPlan() {
    const button = $("#apply-next-plan-button");

    if (button) {
      button.disabled = true;
      button.textContent = "Traitement...";
    }

    try {
      const { error } = await supabase.rpc(
        "vg_apply_to_next_plan"
      );

      if (error) throw error;

      notify(
        "Votre demande pour le niveau suivant a été créée.",
        "success"
      );

      await refreshDashboard();
    } catch (error) {
      notify(
        getErrorMessage(error),
        "error"
      );

      if (button) {
        button.disabled = false;
        button.textContent = "Demander l'accès";
      }
    }
  }

  async function openPublicProfile(userId) {
    if (!userId) return;

    try {
      const { data, error } = await supabase.rpc(
        "vg_get_public_profile",
        {
          p_user_id: userId
        }
      );

      if (error) throw error;

      const profile = getFirstRow(data);

      if (!profile) {
        notify(
          "Profil public indisponible.",
          "error"
        );
        return;
      }

      const modal =
        $("#public-profile-modal") ||
        $(".public-profile-modal");

      if (modal) {
        const username =
          modal.querySelector(
            "[data-public-username]"
          );

        const phone =
          modal.querySelector(
            "[data-public-phone]"
          );

        const role =
          modal.querySelector(
            "[data-public-role]"
          );

        if (username) {
          username.textContent =
            profile.username || "—";
        }

        if (phone) {
          phone.textContent =
            profile.phone || "—";
        }

        if (role) {
          role.textContent =
            normalizeRole(profile.role);
        }

        modal.hidden = false;
        modal.classList.add("open");
        return;
      }

      if (window.VG_UI?.openModal) {
        window.VG_UI.openModal(`
          <div class="public-profile">
            <h3>${escapeHtml(
              profile.username || "Profil"
            )}</h3>

            <p>
              <strong>Rôle :</strong>
              ${escapeHtml(
                normalizeRole(profile.role)
              )}
            </p>

            <p>
              <strong>Téléphone :</strong>
              ${escapeHtml(
                profile.phone || "—"
              )}
            </p>
          </div>
        `);
      }
    } catch (error) {
      notify(
        getErrorMessage(error),
        "error"
      );
    }
  }

  function closePublicProfile() {
    const modal =
      $("#public-profile-modal") ||
      $(".public-profile-modal");

    if (!modal) return;

    modal.hidden = true;
    modal.classList.remove("open");
  }

  async function loadReferralLink() {
    const { data, error } = await supabase.rpc(
      "vg_get_my_referral_link"
    );

    if (error) return;

    const referral = getFirstRow(data);

    if (!referral) return;

    const url =
      referral.referral_url ||
      "";

    const code =
      referral.referral_code ||
      "";

    document
      .querySelectorAll(
        "[data-referral-link]"
      )
      .forEach((element) => {
        if (
          element.tagName === "INPUT" ||
          element.tagName === "TEXTAREA"
        ) {
          element.value = url;
        } else {
          element.textContent = url;
        }
      });

    document
      .querySelectorAll(
        "[data-referral-code]"
      )
      .forEach((element) => {
        element.textContent = code;
      });

    const copyButtons = document.querySelectorAll(
      "[data-copy-referral]"
    );

    copyButtons.forEach((button) => {
      button.onclick = async () => {
        try {
          await navigator.clipboard.writeText(url);

          notify(
            "Lien de parrainage copié.",
            "success"
          );
        } catch {
          notify(
            "Impossible de copier automatiquement le lien.",
            "error"
          );
        }
      };
    });
  }

  async function processReferralCode() {
    const params =
      new URLSearchParams(
        window.location.search
      );

    const referralCode =
      params.get("ref");

    if (!referralCode) return;

    try {
      const { error } = await supabase.rpc(
        "vg_set_referrer_by_code",
        {
          p_referral_code:
            referralCode.trim()
        }
      );

      if (error) {
        const message =
          String(error.message || "").toLowerCase();

        if (
          !message.includes("already") &&
          !message.includes("self")
        ) {
          notify(
            getErrorMessage(error),
            "error"
          );
        }

        return;
      }

      notify(
        "Code de parrainage enregistré.",
        "success"
      );

      const cleanUrl =
        `${window.location.origin}${window.location.pathname}`;

      window.history.replaceState(
        {},
        document.title,
        cleanUrl
      );
    } catch {
      // Le code de parrainage ne doit pas empêcher
      // le chargement du tableau de bord.
    }
  }

  function hideLegacyDonationInterface() {
    document
      .querySelectorAll(
        ".donation-section, [data-donation-section]"
      )
      .forEach((element) => {
        element.hidden = true;
      });

    document
      .querySelectorAll(
        "[data-donation-button], .donation-button"
      )
      .forEach((element) => {
        element.remove();
      });
  }

  function setupFirstPlanButton() {
    const button =
      $("#apply-first-plan-button") ||
      $("[data-apply-first-plan]");

    if (!button) return;

    button.addEventListener(
      "click",
      applyToFirstPlan
    );
  }

  function setupPublicProfileModal() {
    document
      .querySelectorAll(
        "[data-close-public-profile]"
      )
      .forEach((element) => {
        element.addEventListener(
          "click",
          closePublicProfile
        );
      });

    const modal =
      $("#public-profile-modal") ||
      $(".public-profile-modal");

    if (modal) {
      modal.addEventListener(
        "click",
        (event) => {
          if (
            event.target === modal ||
            event.target.classList.contains(
              "modal-backdrop"
            )
          ) {
            closePublicProfile();
          }
        }
      );
    }
  }

  function setupLogout() {
    document
      .querySelectorAll(
        "#logout-button, [data-logout]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          logout
        );
      });
  }

  async function logout() {
    const { error } =
      await supabase.auth.signOut();

    if (error) {
      notify(
        getErrorMessage(error),
        "error"
      );
      return;
    }

    window.location.href =
      "index.html";
  }

  async function refreshDashboard() {
    showLoading("Actualisation...");

    try {
      await loadProfile();
      await loadPlans();
      await loadCurrentBoard();
      await loadMyPendingApplication();
      await loadLegendApplications();
      await loadReferralLink();

      renderPlans();
      setupFirstPlanButton();
    } catch (error) {
      notify(
        getErrorMessage(error),
        "error"
      );
    } finally {
      hideLoading();
    }
  }

  async function init() {
    if (!supabase) {
      console.error(
        "Supabase client introuvable."
      );
      return;
    }

    showLoading("Chargement du tableau de bord...");

    try {
      const {
        data: {
          session
        }
      } = await supabase.auth.getSession();

      if (!session?.user) {
        window.location.href =
          "index.html";
        return;
      }

      currentUser = session.user;

      await processReferralCode();
      await loadProfile();
      await loadPlans();
      await loadCurrentBoard();
      await loadMyPendingApplication();
      await loadLegendApplications();
      await loadReferralLink();

      renderPlans();

      setupFirstPlanButton();
      setupPublicProfileModal();
      setupLogout();

      hideLegacyDonationInterface();
    } catch (error) {
      console.error(error);

      notify(
        getErrorMessage(error),
        "error"
      );
    } finally {
      hideLoading();
    }
  }

  document.addEventListener(
    "DOMContentLoaded",
    init
  );

  window.VG_APP = {
    refresh: refreshDashboard,
    logout,
    openPublicProfile,
    closePublicProfile,
    applyToFirstPlan,
    applyToNextPlan,
    recordSimulationProgress
  };
})();
