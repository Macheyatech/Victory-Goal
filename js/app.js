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
    return window.VG_UI?.escapeHtml
      ? window.VG_UI.escapeHtml(value ?? "")
      : String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
  }

  function points(value) {
    return window.VG_UI?.formatPoints
      ? window.VG_UI.formatPoints(value)
      : `V$${new Intl.NumberFormat("fr-FR", {
          maximumFractionDigits: 2
        }).format(Number(value) || 0)}`;
  }

  function date(value) {
    if (!value) return "—";

    return window.VG_UI?.formatDate
      ? window.VG_UI.formatDate(value)
      : new Intl.DateTimeFormat("fr-FR", {
          dateStyle: "medium",
          timeStyle: "short"
        }).format(new Date(value));
  }

  function countdown(value) {
    if (!value) return "—";

    const target = new Date(value).getTime();
    const remaining = target - Date.now();

    if (!Number.isFinite(remaining) || remaining <= 0) {
      return "Expirée";
    }

    const seconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;

    return `${minutes} min ${String(secs).padStart(2, "0")} s`;
  }

  function notify(message, type = "info") {
    if (window.VG_UI?.notify) {
      window.VG_UI.notify(message, type);
    } else {
      alert(message);
    }
  }

  function errorMessage(error) {
    const raw = String(
      error?.message ||
      error?.error_description ||
      error ||
      "Une erreur est survenue."
    );

    const message = raw.toLowerCase();

    const messages = [
      ["authentication required", "Vous devez être connecté."],
      ["already has a plan", "Vous avez déjà une inscription dans un niveau."],
      ["already belongs", "Vous appartenez déjà à ce niveau."],
      ["application unavailable", "Cette demande n'est plus disponible."],
      ["target slot is occupied", "Cette position est déjà occupée."],
      ["only a legend", "Seule la Légende du tableau peut approuver cette demande."],
      ["self approval", "Vous ne pouvez pas approuver votre propre demande."],
      ["referral code not found", "Le code de parrainage est introuvable."],
      ["self referral", "Vous ne pouvez pas utiliser votre propre code de parrainage."],
      ["plan is above", "Ce niveau n'est pas encore accessible."],
      ["active legend not found", "Aucune Légende active trouvée."],
      ["first plan table is full", "La table du premier niveau est complète."],
      ["first plan unavailable", "Le premier niveau n'est pas disponible actuellement."],
      ["no next plan", "Aucun niveau supérieur n'est actuellement disponible."],
      ["no active branch", "Aucune branche active n'est actuellement disponible."]
    ];

    for (const [needle, translated] of messages) {
      if (message.includes(needle)) {
        return translated;
      }
    }

    return raw;
  }

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value ?? "";
  }

  function setHTML(selector, value) {
    const element = $(selector);
    if (element) element.innerHTML = value ?? "";
  }

  function showLoading(message = "Chargement...") {
    const element = $("#dashboard-loading");

    if (element) {
      element.textContent = message;
      element.hidden = false;
    }
  }

  function hideLoading() {
    const element = $("#dashboard-loading");
    if (element) element.hidden = true;
  }

  function showApp() {
    const app = $("#app");
    if (app) app.hidden = false;
  }

  function hideApp() {
    const app = $("#app");
    if (app) app.hidden = true;
  }

  function firstRow(data) {
    return Array.isArray(data) ? data[0] || null : data || null;
  }

  function roleLabel(role) {
    if (role === "legend") return "Légende";
    if (role === "constructor") return "Constructeur";
    return "Membre";
  }

  function getMembershipFromBoard(board) {
    if (!Array.isArray(board) || !currentUser) {
      return null;
    }

    return (
      board.find(
        (member) =>
          member.user_id === currentUser.id &&
          member.membership_status === "active"
      ) ||
      board.find(
        (member) =>
          member.user_id === currentUser.id &&
          member.membership_id
      ) ||
      null
    );
  }

  function getPlanColors(plan) {
    return {
      primary: plan?.color_primary || "#d4af37",
      secondary: plan?.color_secondary || "#8f6b1f"
    };
  }

  function applyPlanColors(plan = currentPlan) {
    const colors = getPlanColors(plan);

    document.documentElement.style.setProperty(
      "--plan-primary",
      colors.primary
    );

    document.documentElement.style.setProperty(
      "--plan-secondary",
      colors.secondary
    );

    const board = $("#board-container");

    if (board) {
      board.style.setProperty(
        "--board-primary",
        colors.primary
      );

      board.style.setProperty(
        "--board-secondary",
        colors.secondary
      );
    }
  }

  async function loadProfile() {
    const { data, error } = await supabase.rpc(
      "vg_get_my_profile"
    );

    if (error) throw error;

    currentProfile = firstRow(data);

    if (!currentProfile) {
      throw new Error("PROFILE_NOT_FOUND");
    }

    renderProfile();
  }

  function renderProfile() {
    if (!currentProfile) return;

    setText(
      "#profile-username",
      currentProfile.username || "—"
    );

    setText(
      "#profile-phone",
      currentProfile.phone
        ? `Téléphone : ${currentProfile.phone}`
        : "Téléphone : —"
    );

    setText(
      "#profile-email",
      currentUser?.email
        ? `E-mail : ${currentUser.email}`
        : "E-mail : —"
    );

    setText(
      "#profile-role",
      roleLabel(currentProfile.role)
    );

    const avatar = $("#profile-avatar-letter");

    if (avatar) {
      avatar.textContent = String(
        currentProfile.username || "V"
      )
        .charAt(0)
        .toUpperCase();
    }
  }

  async function loadPlans() {
    const { data, error } = await supabase.rpc(
      "vg_get_visible_plans"
    );

    if (error) throw error;

    visiblePlans = Array.isArray(data)
      ? [...data].sort(
          (a, b) =>
            Number(a.sequence_no) -
            Number(b.sequence_no)
        )
      : [];

    renderPlans();
  }

  function renderPlans() {
    const container = $("#plans-list");

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
        const colors = getPlanColors(plan);
        const active =
          currentPlan?.id === plan.id;

        return `
          <article
            class="plan-card ${active ? "active" : ""}"
            data-plan-id="${escapeHtml(plan.id)}"
            style="
              --card-primary:${escapeHtml(colors.primary)};
              --card-secondary:${escapeHtml(colors.secondary)};
            "
          >
            <div class="plan-card-header">
              <div>
                <h3>${escapeHtml(plan.name || "Niveau")}</h3>
                <span>
                  Niveau ${Number(plan.sequence_no || 0)}
                </span>
              </div>

              <strong class="plan-points">
                ${points(plan.plan_points)}
              </strong>
            </div>

            <div class="plan-card-body">
              <p>
                Progression requise :
                <strong>
                  ${Number(plan.required_progress || 0)}
                </strong>
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

    const plans = [...visiblePlans].sort(
      (a, b) =>
        Number(b.sequence_no) -
        Number(a.sequence_no)
    );

    for (const plan of plans) {
      try {
        const { data, error } = await supabase.rpc(
          "vg_get_board",
          {
            p_plan_id: plan.id
          }
        );

        if (error) continue;

        const board = Array.isArray(data)
          ? data
          : [];

        if (board.length) {
          currentPlan = plan;
          currentBoard = board;
          currentMembership =
            getMembershipFromBoard(board);

          break;
        }
      } catch {
        continue;
      }
    }

    if (!currentPlan) {
      renderEmptyBoard();
      renderNoMembershipState();
      return;
    }

    applyPlanColors(currentPlan);

    await loadCurrentProgress();

    renderCurrentPlan();
    renderBoard();
  }

  async function loadCurrentProgress() {
    currentProgress = 0;
    requiredProgress = Number(
      currentPlan?.required_progress || 8
    );

    if (!currentMembership?.membership_id) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from("vg_events")
        .select(
          "id,membership_id,event_type,metadata,created_at"
        )
        .eq(
          "membership_id",
          currentMembership.membership_id
        )
        .eq(
          "event_type",
          "approval"
        );

      if (error) return;

      const events = Array.isArray(data)
        ? data
        : [];

      currentProgress = events.filter(
        (event) =>
          event?.metadata?.source ===
          "points_only_simulation"
      ).length;
    } catch {
      currentProgress = 0;
    }
  }

  function renderCurrentPlan() {
    if (!currentPlan) return;

    const required = Number(
      currentPlan.required_progress || 8
    );

    requiredProgress = required;

    const progress = Math.min(
      currentProgress,
      required
    );

    const percentage =
      required > 0
        ? Math.min(
            100,
            Math.round(
              (progress / required) * 100
            )
          )
        : 0;

    setText(
      "#current-plan-name",
      currentPlan.name || "—"
    );

    setText(
      "#current-plan-points",
      points(currentPlan.plan_points)
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

    document
      .querySelectorAll(
        ".progress-fill,[data-progress-fill]"
      )
      .forEach((element) => {
        element.style.width =
          `${percentage}%`;
      });

    document
      .querySelectorAll(
        "[data-progress-percent]"
      )
      .forEach((element) => {
        element.textContent =
          `${percentage}%`;
      });

    const role =
      currentMembership?.member_role ||
      currentProfile?.role;

    const area =
      $("#simulation-progress-area");

    if (!area) return;

    if (role !== "legend") {
      area.hidden = true;
      area.innerHTML = "";
      return;
    }

    area.hidden = false;

    area.innerHTML = `
      <div class="simulation-progress-card">
        <div>
          <strong>
            Progression de simulation
          </strong>

          <p>
            ${progress} / ${required}
            progression${required > 1 ? "s" : ""}
          </p>
        </div>

        <button
          type="button"
          id="simulation-progress-button"
          class="primary-button"
          ${progress >= required ? "disabled" : ""}
        >
          ${
            progress >= required
              ? "Progression terminée"
              : "Enregistrer une progression"
          }
        </button>
      </div>
    `;

    const button =
      $("#simulation-progress-button");

    if (button) {
      button.addEventListener(
        "click",
        recordSimulationProgress
      );
    }

    renderNextPlan();
  }

  function renderNextPlan() {
    const container =
      $("#next-plan-area");

    if (!container || !currentPlan) {
      return;
    }

    const nextPlan =
      visiblePlans.find(
        (plan) =>
          Number(plan.sequence_no) ===
          Number(currentPlan.sequence_no) + 1
      );

    if (!nextPlan) {
      container.innerHTML = `
        <div class="empty-state">
          Vous êtes actuellement au dernier niveau disponible.
        </div>
      `;
      return;
    }

    const complete =
      currentProgress >=
      Number(
        currentPlan.required_progress || 8
      );

    if (!complete) {
      container.innerHTML = `
        <div class="next-plan-info">
          <strong>
            ${escapeHtml(nextPlan.name)}
          </strong>

          <p>
            Terminez votre progression actuelle
            pour demander l'accès au niveau suivant.
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="next-plan-card">
        <div>
          <strong>
            ${escapeHtml(nextPlan.name)}
          </strong>

          <p>
            ${points(nextPlan.plan_points)}
          </p>

          <small>
            Votre demande sera soumise à la
            Légende du nouveau niveau.
          </small>
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

    $("#apply-next-plan-button")
      ?.addEventListener(
        "click",
        applyToNextPlan
      );
  }

  function renderBoard() {
    const container =
      $("#board-container");

    if (!container) return;

    if (!currentBoard.length) {
      renderEmptyBoard();
      return;
    }

    const byPosition = new Map();

    currentBoard.forEach((member) => {
      byPosition.set(
        Number(member.position_no),
        member
      );
    });

    const maxPosition =
      currentBoard.some(
        (member) =>
          Number(member.position_no) >= 12
      )
        ? 12
        : 9;

    const nodes = [];

    for (
      let position = 1;
      position <= maxPosition;
      position++
    ) {
      nodes.push(
        renderBoardNode(
          byPosition.get(position),
          position
        )
      );
    }

    const colors =
      getPlanColors(currentPlan);

    container.innerHTML = `
      <div
        class="victory-board"
        style="
          --board-primary:${escapeHtml(colors.primary)};
          --board-secondary:${escapeHtml(colors.secondary)};
        "
      >
        ${nodes.join("")}
      </div>
    `;

    setText(
      "#board-plan-name",
      currentPlan.name || "—"
    );

    setText(
      "#board-division-name",
      currentMembership?.cycle_kind === "branch"
        ? "Division de branche"
        : "Table Genesis"
    );

    container
      .querySelectorAll(
        "[data-public-profile]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            openPublicProfile(
              button.dataset.publicProfile
            )
        );
      });
  }

  function renderBoardNode(
    member,
    position
  ) {
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

    const pending =
      !member.membership_id &&
      Boolean(member.pending_application_id);

    const username =
      member.username ||
      (pending
        ? "Demande en attente"
        : "Membre");

    const role =
      member.member_role
        ? roleLabel(member.member_role)
        : "Membre";

    if (pending) {
      return `
        <div
          class="board-node pending"
          data-position="${position}"
        >
          <span class="board-position">
            ${position}
          </span>

          <span class="board-node-label">
            ${escapeHtml(username)}
          </span>

          <span class="board-pending">
            En attente
          </span>
        </div>
      `;
    }

    const clickable =
      member.user_id &&
      member.user_id !== currentUser?.id;

    return `
      <div
        class="board-node occupied"
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
              <span class="board-username">
                ${escapeHtml(username)}
              </span>
            `
        }

        <span class="board-role">
          ${escapeHtml(role)}
        </span>
      </div>
    `;
  }

  function renderEmptyBoard() {
    const container =
      $("#board-container");

    if (!container) return;

    container.innerHTML = `
      <div class="empty-state">
        Vous n'avez pas encore de tableau actif.
      </div>
    `;
  }

  function renderNoMembershipState() {
    const container =
      $("#board-container");

    if (!container) return;

    if (pendingApplication) {
      return;
    }

    const firstPlan =
      visiblePlans.find(
        (plan) =>
          Number(plan.sequence_no) === 1
      );

    if (!firstPlan) return;

    container.innerHTML = `
      <div class="join-table-card">
        <div class="join-table-icon">
          +
        </div>

        <div>
          <h3>
            Rejoindre le premier tableau
          </h3>

          <p>
            Envoyez votre demande à la
            Légende. Vous entrerez uniquement
            après son approbation.
          </p>

          <span>
            ${escapeHtml(firstPlan.name)}
          </span>
        </div>

        <button
          type="button"
          id="apply-first-plan-button"
          class="primary-button"
        >
          Demander à entrer
        </button>
      </div>
    `;

    $("#apply-first-plan-button")
      ?.addEventListener(
        "click",
        applyToFirstPlan
      );
  }

  async function loadMyPendingApplication() {
    pendingApplication = null;

    try {
      const {
        data,
        error
      } = await supabase
        .from("vg_applications")
        .select(`
          id,
          target_plan_id,
          target_cycle_id,
          target_table_id,
          target_slot_id,
          target_position_no,
          status,
          expires_at,
          created_at
        `)
        .eq(
          "user_id",
          currentUser.id
        )
        .eq(
          "status",
          "pending"
        )
        .gt(
          "expires_at",
          new Date().toISOString()
        )
        .order(
          "created_at",
          { ascending: false }
        )
        .limit(1);

      if (
        !error &&
        Array.isArray(data) &&
        data.length
      ) {
        pendingApplication = data[0];
      }
    } catch {
      pendingApplication = null;
    }

    renderMyPendingApplication();
  }

  function renderMyPendingApplication() {
    const section =
      $("#pending-section");

    if (!section) return;

    if (!pendingApplication) {
      section.hidden = true;
      return;
    }

    section.hidden = false;

    section.innerHTML = `
      <div class="pending-card">
        <div class="pending-card-icon">
          ⏳
        </div>

        <div>
          <strong>
            Demande en attente d'approbation
          </strong>

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
            ${date(
              pendingApplication.expires_at
            )}
          </p>

          <span
            class="pending-countdown"
            data-countdown="${escapeHtml(
              pendingApplication.expires_at
            )}"
          >
            ${countdown(
              pendingApplication.expires_at
            )}
          </span>
        </div>
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

    try {
      const {
        data,
        error
      } = await supabase.rpc(
        "vg_get_pending_for_legend"
      );

      if (!error && Array.isArray(data)) {
        legendApplications = data;
      }
    } catch {
      legendApplications = [];
    }

    renderLegendApplications();
  }

  function renderLegendApplications() {
    const section =
      $("#approval-section");

    if (!section) return;

    const role =
      currentMembership?.member_role ||
      currentProfile?.role;

    if (role !== "legend") {
      section.hidden = true;
      return;
    }

    section.hidden = false;

    if (!legendApplications.length) {
      section.innerHTML = `
        <div class="empty-state">
          Aucune demande en attente pour votre tableau.
        </div>
      `;
      return;
    }

    section.innerHTML = `
      <div class="approval-list">
        ${legendApplications
          .map((application) => `
            <article
              class="approval-card"
              data-application-id="${escapeHtml(
                application.id
              )}"
            >
              <div class="approval-card-main">
                <strong>
                  Nouvelle demande
                </strong>

                <p>
                  Position :
                  <strong>
                    ${Number(
                      application.target_position_no || 0
                    )}
                  </strong>
                </p>

                <small>
                  Expire dans :
                  <span
                    data-countdown="${escapeHtml(
                      application.expires_at
                    )}"
                  >
                    ${countdown(
                      application.expires_at
                    )}
                  </span>
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
          `)
          .join("")}
      </div>
    `;

    section
      .querySelectorAll(
        ".approve-application-button"
      )
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
    if (
      !currentMembership?.membership_id
    ) {
      notify(
        "Aucune adhésion active trouvée.",
        "error"
      );
      return;
    }

    const button =
      $("#simulation-progress-button");

    if (button) {
      button.disabled = true;
      button.textContent =
        "Enregistrement...";
    }

    try {
      const {
        data,
        error
      } = await supabase.rpc(
        "vg_record_simulation_progress",
        {
          p_legend_membership_id:
            currentMembership.membership_id
        }
      );

      if (error) throw error;

      const result =
        firstRow(data) || data;

      notify(
        result?.completed
          ? "La progression requise est terminée."
          : "Progression de simulation enregistrée.",
        "success"
      );

      await refreshDashboard();
    } catch (error) {
      notify(
        errorMessage(error),
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
      button.textContent =
        "Approbation...";
    }

    try {
      const { error } =
        await supabase.rpc(
          "vg_approve_application",
          {
            p_application_id:
              applicationId
          }
        );

      if (error) throw error;

      notify(
        "Demande approuvée. Le membre est maintenant dans le tableau.",
        "success"
      );

      await refreshDashboard();
    } catch (error) {
      notify(
        errorMessage(error),
        "error"
      );

      if (button) {
        button.disabled = false;
        button.textContent =
          "Approuver";
      }
    }
  }

  async function applyToFirstPlan() {
    const button =
      $("#apply-first-plan-button");

    if (button) {
      button.disabled = true;
      button.textContent =
        "Envoi...";
    }

    try {
      const { error } =
        await supabase.rpc(
          "vg_apply_to_first_plan"
        );

      if (error) throw error;

      notify(
        "Votre demande a été envoyée à la Légende pour approbation.",
        "success"
      );

      await refreshDashboard();
    } catch (error) {
      notify(
        errorMessage(error),
        "error"
      );

      if (button) {
        button.disabled = false;
        button.textContent =
          "Demander à entrer";
      }
    }
  }

  async function applyToNextPlan() {
    const button =
      $("#apply-next-plan-button");

    if (button) {
      button.disabled = true;
      button.textContent =
        "Envoi...";
    }

    try {
      const { error } =
        await supabase.rpc(
          "vg_apply_to_next_plan_for_user",
          {
            p_user_id:
              currentUser.id
          }
        );

      if (error) throw error;

      notify(
        "Votre demande pour le niveau suivant a été envoyée à la Légende concernée.",
        "success"
      );

      await refreshDashboard();
    } catch (error) {
      notify(
        errorMessage(error),
        "error"
      );

      if (button) {
        button.disabled = false;
        button.textContent =
          "Demander l'accès";
      }
    }
  }

  async function openPublicProfile(userId) {
    if (!userId) return;

    try {
      const {
        data,
        error
      } = await supabase.rpc(
        "vg_get_public_profile",
        {
          p_user_id: userId
        }
      );

      if (error) throw error;

      const profile =
        firstRow(data);

      if (!profile) {
        notify(
          "Profil public indisponible.",
          "error"
        );
        return;
      }

      const modal =
        $("#public-profile-modal");

      if (!modal) return;

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
          roleLabel(profile.role);
      }

      modal.hidden = false;
      modal.classList.add("open");
      modal.setAttribute(
        "aria-hidden",
        "false"
      );
    } catch (error) {
      notify(
        errorMessage(error),
        "error"
      );
    }
  }

  function closePublicProfile() {
    const modal =
      $("#public-profile-modal");

    if (!modal) return;

    modal.hidden = true;
    modal.classList.remove("open");
    modal.setAttribute(
      "aria-hidden",
      "true"
    );
  }

  async function loadReferralLink() {
    try {
      const {
        data,
        error
      } = await supabase.rpc(
        "vg_get_my_referral_link"
      );

      if (error) return;

      const referral =
        firstRow(data);

      if (!referral) return;

      const url =
        referral.referral_url || "";

      const code =
        referral.referral_code || "";

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

      document
        .querySelectorAll(
          "[data-copy-referral]"
        )
        .forEach((button) => {
          button.onclick = async () => {
            try {
              await navigator.clipboard.writeText(
                url
              );

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
    } catch {
      return;
    }
  }

  async function processReferralCode() {
    const params =
      new URLSearchParams(
        window.location.search
      );

    const code =
      params.get("ref");

    if (!code) return;

    try {
      const { error } =
        await supabase.rpc(
          "vg_set_referrer_by_code",
          {
            p_referral_code:
              code.trim()
          }
        );

      if (!error) {
        notify(
          "Code de parrainage enregistré.",
          "success"
        );

        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
      }
    } catch {
      return;
    }
  }

  function hideLegacyDonationInterface() {
    document
      .querySelectorAll(
        ".donation-section,[data-donation-section],[data-donation-button],.donation-button"
      )
      .forEach((element) => {
        element.hidden = true;
      });
  }

  function setupModal() {
    document
      .querySelectorAll(
        "[data-close-public-profile]"
      )
      .forEach((element) => {
        if (element.dataset.bound) return;

        element.dataset.bound = "true";

        element.addEventListener(
          "click",
          closePublicProfile
        );
      });

    const modal =
      $("#public-profile-modal");

    if (
      modal &&
      !modal.dataset.bound
    ) {
      modal.dataset.bound = "true";

      modal.addEventListener(
        "click",
        (event) => {
          if (event.target === modal) {
            closePublicProfile();
          }
        }
      );
    }
  }

  function setupLogout() {
    document
      .querySelectorAll(
        "#logout-button,[data-logout]"
      )
      .forEach((button) => {
        if (button.dataset.bound) return;

        button.dataset.bound = "true";

        button.addEventListener(
          "click",
          logout
        );
      });
  }

  function setupRefresh() {
    document
      .querySelectorAll(
        "#refresh-button,#board-refresh-button"
      )
      .forEach((button) => {
        if (button.dataset.bound) return;

        button.dataset.bound = "true";

        button.addEventListener(
          "click",
          refreshDashboard
        );
      });
  }

  function updateCountdowns() {
    document
      .querySelectorAll(
        "[data-countdown]"
      )
      .forEach((element) => {
        element.textContent =
          countdown(
            element.dataset.countdown
          );
      });
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.replace(
      "index.html"
    );
  }

  async function handleMissingProfile() {
    hideApp();

    try {
      await supabase.auth.signOut();
    } catch {}

    window.location.replace(
      "index.html?create=1"
    );
  }

  async function refreshDashboard() {
    showLoading(
      "Actualisation..."
    );

    try {
      await loadProfile();
      await loadPlans();
      await loadCurrentBoard();
      await loadMyPendingApplication();

      if (!currentMembership) {
        renderNoMembershipState();
      }

      await loadLegendApplications();
      await loadReferralLink();

      renderPlans();

      setupModal();
      setupLogout();
      setupRefresh();
      hideLegacyDonationInterface();

      updateCountdowns();

      showApp();
    } catch (error) {
      if (
        error?.message ===
        "PROFILE_NOT_FOUND"
      ) {
        await handleMissingProfile();
        return;
      }

      notify(
        errorMessage(error),
        "error"
      );
    } finally {
      hideLoading();
    }
  }

  async function init() {
    hideApp();

    if (!supabase) {
      console.error(
        "Supabase client introuvable."
      );
      return;
    }

    showLoading(
      "Chargement du tableau de bord..."
    );

    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.user) {
        window.location.replace(
          "index.html"
        );
        return;
      }

      currentUser =
        session.user;

      await processReferralCode();

      try {
        await loadProfile();
      } catch (error) {
        if (
          error?.message ===
          "PROFILE_NOT_FOUND"
        ) {
          await handleMissingProfile();
          return;
        }

        throw error;
      }

      await loadPlans();
      await loadCurrentBoard();
      await loadMyPendingApplication();

      if (!currentMembership) {
        renderNoMembershipState();
      }

      await loadLegendApplications();
      await loadReferralLink();

      renderPlans();

      setupModal();
      setupLogout();
      setupRefresh();
      hideLegacyDonationInterface();

      updateCountdowns();

      setInterval(
        updateCountdowns,
        1000
      );

      showApp();
    } catch (error) {
      console.error(error);

      notify(
        errorMessage(error),
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
    approveApplication,
    recordSimulationProgress
  };
})();
