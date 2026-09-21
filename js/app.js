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

  let countdownTimer = null;

  const $ = (selector) => document.querySelector(selector);

  /* =========================================================
     UTILITAIRES
  ========================================================= */

  function escapeHtml(value) {
    if (window.VG_UI?.escapeHtml) {
      return window.VG_UI.escapeHtml(value ?? "");
    }

    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function firstRow(data) {
    return Array.isArray(data)
      ? data[0] || null
      : data || null;
  }

  function points(value) {
    if (window.VG_UI?.formatPoints) {
      return window.VG_UI.formatPoints(value);
    }

    const number = Number(value);

    return `V$${new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits: 2
    }).format(Number.isFinite(number) ? number : 0)}`;
  }

  function formatDate(value) {
    if (!value) return "—";

    if (window.VG_UI?.formatDate) {
      return window.VG_UI.formatDate(value);
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(parsed);
  }

  function formatCountdown(value) {
    if (!value) return "—";

    const target = new Date(value).getTime();

    if (!Number.isFinite(target)) {
      return "—";
    }

    const remaining = target - Date.now();

    if (remaining <= 0) {
      return "Expirée";
    }

    const totalSeconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes} min ${String(seconds).padStart(2, "0")} s`;
  }

  function notify(message, type = "info") {
    if (window.VG_UI?.notify) {
      window.VG_UI.notify(message, type);
      return;
    }

    alert(message);
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

  function showLoading(message = "Chargement...") {
    const element = $("#dashboard-loading");

    if (!element) return;

    element.hidden = false;

    const text =
      $("#dashboard-loading-text");

    if (text) {
      text.textContent = message;
    } else {
      element.textContent = message;
    }
  }

  function hideLoading() {
    const element = $("#dashboard-loading");

    if (element) {
      element.hidden = true;
    }
  }

  function showApp() {
    const app = $("#app");

    if (app) {
      app.hidden = false;
    }
  }

  function hideApp() {
    const app = $("#app");

    if (app) {
      app.hidden = true;
    }
  }

  function roleLabel(role) {
    if (role === "legend") {
      return "Légende";
    }

    if (role === "constructor") {
      return "Constructeur";
    }

    return "Membre";
  }

  function errorMessage(error) {
    const raw = String(
      error?.message ||
      error?.error_description ||
      error ||
      "Une erreur est survenue."
    );

    const message = raw.toLowerCase();

    const translations = [
      [
        "authentication required",
        "Vous devez être connecté."
      ],
      [
        "plan unavailable",
        "Ce niveau n'est pas disponible."
      ],
      [
        "plan is above",
        "Ce niveau n'est pas encore accessible."
      ],
      [
        "already has an active membership",
        "Vous avez déjà une inscription active."
      ],
      [
        "already has a plan",
        "Vous avez déjà une inscription dans un niveau."
      ],
      [
        "application unavailable",
        "Cette demande n'est plus disponible."
      ],
      [
        "target slot is occupied",
        "Cette position est déjà occupée."
      ],
      [
        "only a legend",
        "Seule la Légende du tableau peut approuver cette demande."
      ],
      [
        "self approval",
        "Vous ne pouvez pas approuver votre propre demande."
      ],
      [
        "referral code not found",
        "Le code de parrainage est introuvable."
      ],
      [
        "self referral",
        "Vous ne pouvez pas utiliser votre propre code de parrainage."
      ],
      [
        "first plan table is full",
        "Le premier tableau est complet."
      ],
      [
        "first plan unavailable",
        "Le premier niveau n'est pas disponible actuellement."
      ],
      [
        "no next plan",
        "Aucun niveau supérieur n'est actuellement disponible."
      ],
      [
        "no active branch",
        "Aucune branche active n'est actuellement disponible."
      ],
      [
        "active legend not found",
        "Aucune Légende active n'a été trouvée."
      ]
    ];

    for (const [needle, translation] of translations) {
      if (message.includes(needle)) {
        return translation;
      }
    }

    return raw;
  }

  /* =========================================================
     PROFIL
  ========================================================= */

  async function loadProfile() {
    const { data, error } =
      await supabase.rpc("vg_get_my_profile");

    if (error) {
      throw error;
    }

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

    const avatar =
      $("#profile-avatar-letter");

    if (avatar) {
      avatar.textContent = String(
        currentProfile.username || "V"
      )
        .charAt(0)
        .toUpperCase();
    }
  }

  /* =========================================================
     PLANS
  ========================================================= */

  async function loadPlans() {
    const { data, error } =
      await supabase.rpc("vg_get_visible_plans");

    if (error) {
      throw error;
    }

    visiblePlans = Array.isArray(data)
      ? [...data].sort(
          (a, b) =>
            Number(a.sequence_no) -
            Number(b.sequence_no)
        )
      : [];

    renderPlans();
  }

  function getPlanColors(plan) {
    return {
      primary:
        plan?.color_primary || "#d4af37",

      secondary:
        plan?.color_secondary || "#8f6b1f"
    };
  }

  function applyPlanColors(plan) {
    const colors = getPlanColors(plan);

    document.documentElement.style.setProperty(
      "--plan-primary",
      colors.primary
    );

    document.documentElement.style.setProperty(
      "--plan-secondary",
      colors.secondary
    );

    const board =
      $("#board-container");

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

  function renderPlans() {
    const container =
      $("#plans-list");

    if (!container) return;

    if (!visiblePlans.length) {
      container.innerHTML = `
        <div class="empty-state">
          Aucun niveau disponible pour le moment.
        </div>
      `;

      return;
    }

    container.innerHTML =
      visiblePlans
        .map((plan) => {
          const colors =
            getPlanColors(plan);

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
                  <h3>
                    ${escapeHtml(
                      plan.name || "Niveau"
                    )}
                  </h3>

                  <span>
                    Niveau ${Number(
                      plan.sequence_no || 0
                    )}
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
                    ${Number(
                      plan.required_progress || 0
                    )}
                  </strong>
                </p>

              </div>

            </article>
          `;
        })
        .join("");
  }

  /* =========================================================
     TABLEAU
  ========================================================= */

  function findActiveMembership(board) {
    if (!Array.isArray(board)) {
      return null;
    }

    if (!currentUser) {
      return null;
    }

    return (
      board.find(
        (row) =>
          row.user_id === currentUser.id &&
          row.membership_id &&
          row.membership_status === "active"
      ) || null
    );
  }

  function findPendingForCurrentUser(board) {
    if (!Array.isArray(board)) {
      return null;
    }

    if (!currentUser) {
      return null;
    }

    return (
      board.find(
        (row) =>
          row.user_id === currentUser.id &&
          row.pending_application_id
      ) || null
    );
  }

  async function loadCurrentBoard() {
    currentPlan = null;
    currentBoard = [];
    currentMembership = null;

    const plans =
      [...visiblePlans].sort(
        (a, b) =>
          Number(a.sequence_no) -
          Number(b.sequence_no)
      );

    let pendingCandidate = null;
    let pendingPlan = null;

    for (const plan of plans) {
      try {
        const {
          data,
          error
        } = await supabase.rpc(
          "vg_get_board",
          {
            p_plan_id: plan.id
          }
        );

        if (error) {
          console.error(
            "vg_get_board:",
            plan.name,
            error
          );

          continue;
        }

        const board =
          Array.isArray(data)
            ? data
            : [];

        if (!board.length) {
          continue;
        }

        /*
         * PRIORITÉ ABSOLUE :
         * Si l'utilisateur possède déjà
         * une adhésion active, son tableau
         * doit être sélectionné.
         */
        const activeMembership =
          findActiveMembership(board);

        if (activeMembership) {
          currentPlan = plan;
          currentBoard = board;
          currentMembership =
            activeMembership;

          break;
        }

        /*
         * Sinon, on garde éventuellement
         * un tableau où sa demande est
         * encore en attente.
         */
        const pending =
          findPendingForCurrentUser(
            board
          );

        if (
          pending &&
          !pendingCandidate
        ) {
          pendingCandidate = board;
          pendingPlan = plan;
        }

      } catch (error) {
        console.error(
          "Erreur tableau:",
          error
        );
      }
    }

    /*
     * Aucun membership actif :
     * afficher le tableau de la demande
     * si l'utilisateur est en attente.
     */
    if (!currentPlan && pendingCandidate) {
      currentPlan = pendingPlan;
      currentBoard = pendingCandidate;
      currentMembership = null;

      applyPlanColors(currentPlan);

      renderBoard();
      renderCurrentPlan();

      return;
    }

    /*
     * Aucun tableau.
     */
    if (!currentPlan) {
      currentBoard = [];
      currentMembership = null;

      renderEmptyBoard();

      return;
    }

    /*
     * Tableau trouvé.
     */
    applyPlanColors(currentPlan);

    calculateProgressFromBoard();

    renderCurrentPlan();
    renderBoard();
  }

  /*
   * Le backend utilise les positions de progression
   * comme source de vérité.
   *
   * Genesis :
   * positions 2 à 9 = 8 progressions.
   *
   * Branch :
   * positions 5 à 12 = 8 progressions.
   */
  function calculateProgressFromBoard() {
    if (!currentPlan) {
      currentProgress = 0;
      requiredProgress = 0;
      return;
    }

    requiredProgress =
      Number(
        currentPlan.required_progress || 8
      );

    if (!Array.isArray(currentBoard)) {
      currentProgress = 0;
      return;
    }

    currentProgress =
      currentBoard.filter((row) => {
        if (!row.membership_id) {
          return false;
        }

        if (
          row.membership_status !==
          "active"
        ) {
          return false;
        }

        return Number(row.position_no) > 1;
      }).length;

    currentProgress = Math.min(
      currentProgress,
      requiredProgress
    );
  }

  function renderBoard() {
    const container =
      $("#board-container");

    if (!container) return;

    if (
      !currentPlan ||
      !Array.isArray(currentBoard) ||
      !currentBoard.length
    ) {
      renderEmptyBoard();
      return;
    }

    const positions =
      new Map();

    currentBoard.forEach((row) => {
      positions.set(
        Number(row.position_no),
        row
      );
    });

    const maxPosition =
      currentBoard.some(
        (row) =>
          Number(row.position_no) >= 12
      )
        ? 12
        : 9;

    const colors =
      getPlanColors(currentPlan);

    const nodes = [];

    for (
      let position = 1;
      position <= maxPosition;
      position++
    ) {
      nodes.push(
        renderBoardNode(
          positions.get(position),
          position
        )
      );
    }

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

    const cycleKind =
      currentMembership?.cycle_kind ||
      currentBoard[0]?.cycle_kind;

    setText(
      "#board-division-name",
      cycleKind === "branch"
        ? "Division de branche"
        : "Table Genesis"
    );

    bindBoardProfileButtons();
  }

  function renderBoardNode(
    row,
    position
  ) {
    /*
     * POSITION LIBRE
     */
    if (!row) {
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

    /*
     * DEMANDE EN ATTENTE
     */
    const isPending =
      !row.membership_id &&
      Boolean(
        row.pending_application_id
      );

    if (isPending) {
      const pendingUsername =
        row.username ||
        (
          row.user_id ===
          currentUser?.id
            ? "Vous"
            : "Demande en attente"
        );

      return `
        <div
          class="board-node pending"
          data-position="${position}"
        >

          <span class="board-position">
            ${position}
          </span>

          <span class="board-node-label">
            ${escapeHtml(
              pendingUsername
            )}
          </span>

          <span class="board-pending">
            En attente
          </span>

        </div>
      `;
    }

    /*
     * MEMBRE OCCUPANT
     */
    if (row.membership_id) {
      const username =
        row.username ||
        (
          row.user_id ===
          currentUser?.id
            ? "Vous"
            : "Membre"
        );

      const role =
        roleLabel(
          row.member_role
        );

      const isCurrentUser =
        row.user_id ===
        currentUser?.id;

      if (
        !isCurrentUser &&
        row.user_id
      ) {
        return `
          <div
            class="board-node occupied"
            data-position="${position}"
          >

            <span class="board-position">
              ${position}
            </span>

            <button
              type="button"
              class="board-username"
              data-public-profile="${escapeHtml(
                row.user_id
              )}"
            >
              ${escapeHtml(username)}
            </button>

            <span class="board-role">
              ${escapeHtml(role)}
            </span>

          </div>
        `;
      }

      return `
        <div
          class="board-node occupied current-user"
          data-position="${position}"
        >

          <span class="board-position">
            ${position}
          </span>

          <span class="board-username">
            ${escapeHtml(username)}
          </span>

          <span class="board-role">
            ${escapeHtml(role)}
          </span>

        </div>
      `;
    }

    /*
     * SÉCURITÉ :
     * si la ligne existe mais n'a ni membre
     * ni demande, elle reste libre.
     */
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

  function bindBoardProfileButtons() {
    document
      .querySelectorAll(
        "[data-public-profile]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            openPublicProfile(
              button.dataset.publicProfile
            );
          }
        );
      });
  }

  function renderEmptyBoard() {
    const container =
      $("#board-container");

    if (!container) return;

    container.innerHTML = `
      <div class="empty-state">
        Aucun tableau actif à afficher.
      </div>
    `;

    setText(
      "#board-plan-name",
      "—"
    );

    setText(
      "#board-division-name",
      "—"
    );
  }

  /* =========================================================
     PROGRESSION
  ========================================================= */

  function renderCurrentPlan() {
    if (!currentPlan) {
      setText(
        "#current-plan-name",
        "—"
      );

      setText(
        "#current-plan-points",
        "V$0"
      );

      setText(
        "#progress-value",
        "0 / 0"
      );

      setText(
        "#progress-count",
        "0"
      );

      setText(
        "#required-progress",
        "0"
      );

      return;
    }

    requiredProgress =
      Number(
        currentPlan.required_progress || 8
      );

    const progress =
      Math.min(
        currentProgress,
        requiredProgress
      );

    const percentage =
      requiredProgress > 0
        ? Math.min(
            100,
            Math.round(
              (progress /
                requiredProgress) *
                100
            )
          )
        : 0;

    setText(
      "#current-plan-name",
      currentPlan.name || "—"
    );

    setText(
      "#current-plan-points",
      points(
        currentPlan.plan_points
      )
    );

    setText(
      "#progress-value",
      `${progress} / ${requiredProgress}`
    );

    setText(
      "#progress-count",
      String(progress)
    );

    setText(
      "#required-progress",
      String(requiredProgress)
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

    renderSimulationArea();
    renderNextPlan();
  }

  function renderSimulationArea() {
    const area =
      $("#simulation-progress-area");

    if (!area) return;

    const role =
      currentMembership?.member_role ||
      currentProfile?.role;

    /*
     * Se sèlman Légende ki gen kontwòl
     * sou progression simulation lan.
     */
    if (
      role !== "legend" ||
      !currentMembership
    ) {
      area.hidden = true;
      area.innerHTML = "";
      return;
    }

    area.hidden = false;

    const complete =
      currentProgress >=
      requiredProgress;

    area.innerHTML = `
      <div class="simulation-progress-card">

        <div>
          <strong>
            Progression de simulation
          </strong>

          <p>
            ${currentProgress}
            /
            ${requiredProgress}
            progression
            ${
              requiredProgress > 1
                ? "s"
                : ""
            }
          </p>
        </div>

        <button
          type="button"
          id="simulation-progress-button"
          class="primary-button"
          ${complete ? "disabled" : ""}
        >
          ${
            complete
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
  }

  /* =========================================================
     PROCHAIN NIVEAU
  ========================================================= */

  function renderNextPlan() {
    const section =
      $("#next-plan-section");

    const container =
      $("#next-plan-area");

    if (!section || !container) {
      return;
    }

    const role =
      currentMembership?.member_role ||
      currentProfile?.role;

    /*
     * Se Légende ki gen progression
     * sou pwochen nivo a.
     */
    if (
      role !== "legend" ||
      !currentMembership ||
      !currentPlan
    ) {
      section.hidden = true;
      return;
    }

    const nextPlan =
      visiblePlans.find(
        (plan) =>
          Number(plan.sequence_no) ===
          Number(
            currentPlan.sequence_no
          ) + 1
      );

    if (!nextPlan) {
      section.hidden = false;

      container.innerHTML = `
        <div class="empty-state">
          Vous êtes actuellement au dernier niveau disponible.
        </div>
      `;

      return;
    }

    section.hidden = false;

    const complete =
      currentProgress >=
      Number(
        currentPlan.required_progress || 8
      );

    if (!complete) {
      container.innerHTML = `
        <div class="next-plan-info">

          <strong>
            ${escapeHtml(
              nextPlan.name
            )}
          </strong>

          <p>
            Terminez votre progression actuelle
            pour continuer votre parcours.
          </p>

        </div>
      `;

      return;
    }

    container.innerHTML = `
      <div class="next-plan-card">

        <div>

          <strong>
            ${escapeHtml(
              nextPlan.name
            )}
          </strong>

          <p>
            ${points(
              nextPlan.plan_points
            )}
          </p>

          <small>
            Votre demande sera soumise
            à la Légende du nouveau niveau.
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

    const button =
      $("#apply-next-plan-button");

    if (button) {
      button.addEventListener(
        "click",
        applyToNextPlan
      );
    }
  }

  /* =========================================================
     DEMANDES PERSONNELLES
  ========================================================= */

  async function loadMyPendingApplication() {
    pendingApplication = null;

    if (!currentUser) return;

    try {
      const {
        data,
        error
      } = await supabase
        .from("vg_applications")
        .select(`
          id,
          user_id,
          target_plan_id,
          target_division_id,
          target_table_id,
          target_cycle_id,
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
          {
            ascending: false
          }
        )
        .limit(1);

      if (error) {
        console.error(
          "Demandes personnelles:",
          error
        );

        return;
      }

      if (
        Array.isArray(data) &&
        data.length
      ) {
        pendingApplication =
          data[0];
      }
    } catch (error) {
      console.error(
        "Erreur demande personnelle:",
        error
      );
    }

    renderMyPendingApplication();
  }

  function renderMyPendingApplication() {
    const section =
      $("#pending-section");

    const content =
      $("#pending-content");

    if (!section || !content) {
      return;
    }

    /*
     * Si la personne a déjà une
     * adhésion active, elle n'a plus
     * besoin d'une carte de demande.
     */
    if (currentMembership) {
      section.hidden = true;
      content.innerHTML = "";
      return;
    }

    if (!pendingApplication) {
      section.hidden = true;
      content.innerHTML = "";
      return;
    }

    section.hidden = false;

    content.innerHTML = `
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
                pendingApplication.target_position_no ||
                0
              )}
            </strong>
          </p>

          <p>
            Créée le :
            ${formatDate(
              pendingApplication.created_at
            )}
          </p>

          <p>
            Expiration :
            ${formatDate(
              pendingApplication.expires_at
            )}
          </p>

          <span
            class="pending-countdown"
            data-countdown="${escapeHtml(
              pendingApplication.expires_at
            )}"
          >
            ${formatCountdown(
              pendingApplication.expires_at
            )}
          </span>

        </div>

      </div>
    `;
  }

  /* =========================================================
     DEMANDES À APPROUVER
  ========================================================= */

  async function loadLegendApplications() {
    legendApplications = [];

    const role =
      currentMembership?.member_role ||
      currentProfile?.role;

    if (
      role !== "legend" ||
      !currentMembership
    ) {
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

      if (error) {
        console.error(
          "Demandes Légende:",
          error
        );

        return;
      }

      legendApplications =
        Array.isArray(data)
          ? data
          : [];
    } catch (error) {
      console.error(
        "Erreur demandes Légende:",
        error
      );
    }

    renderLegendApplications();
  }

  function renderLegendApplications() {
    const section =
      $("#approval-section");

    const list =
      $("#approval-list");

    if (!section || !list) {
      return;
    }

    const role =
      currentMembership?.member_role ||
      currentProfile?.role;

    if (
      role !== "legend" ||
      !currentMembership
    ) {
      section.hidden = true;
      list.innerHTML = "";
      return;
    }

    section.hidden = false;

    if (!legendApplications.length) {
      list.innerHTML = `
        <div class="empty-state">
          Aucune demande en attente pour votre tableau.
        </div>
      `;

      return;
    }

    list.innerHTML =
      legendApplications
        .map((application) => {
          return `
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
                      application.target_position_no ||
                      0
                    )}
                  </strong>
                </p>

                <small>
                  Créée le :
                  ${formatDate(
                    application.created_at
                  )}
                </small>

                <small>
                  Expire dans :
                  <span
                    data-countdown="${escapeHtml(
                      application.expires_at
                    )}"
                  >
                    ${formatCountdown(
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
          `;
        })
        .join("");

    list
      .querySelectorAll(
        ".approve-application-button"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            approveApplication(
              button.dataset
                .applicationId,
              button
            )
        );
      });
  }

  /* =========================================================
     ENTRÉE PREMIER PLAN
  ========================================================= */

  function renderJoinFirstPlan() {
    const container =
      $("#board-container");

    if (!container) return;

    /*
     * IMPORTANT :
     * Si l'utilisateur est déjà dans
     * un tableau, aucune demande ne doit
     * apparaître ici.
     */
    if (currentMembership) {
      return;
    }

    /*
     * S'il a déjà une demande en attente,
     * on ne montre pas un deuxième bouton.
     */
    if (pendingApplication) {
      return;
    }

    const firstPlan =
      visiblePlans.find(
        (plan) =>
          Number(plan.sequence_no) === 1
      );

    if (!firstPlan) {
      return;
    }

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
            ${escapeHtml(
              firstPlan.name
            )}
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

    const button =
      $("#apply-first-plan-button");

    if (button) {
      button.addEventListener(
        "click",
        applyToFirstPlan
      );
    }
  }

  /* =========================================================
     APPLICATION PREMIER PLAN
  ========================================================= */

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

      if (error) {
        throw error;
      }

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

  /* =========================================================
     APPLICATION PLAN SUIVANT
  ========================================================= */

  async function applyToNextPlan() {
    if (!currentUser) {
      return;
    }

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

      if (error) {
        throw error;
      }

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

  /* =========================================================
     APPROBATION
  ========================================================= */

  async function approveApplication(
    applicationId,
    button
  ) {
    if (!applicationId) {
      return;
    }

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

      if (error) {
        throw error;
      }

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

  /* =========================================================
     PROGRESSION DE SIMULATION
  ========================================================= */

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

      if (error) {
        throw error;
      }

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

  /* =========================================================
     PROFIL PUBLIC
  ========================================================= */

  async function openPublicProfile(
    userId
  ) {
    if (!userId) {
      return;
    }

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

      if (error) {
        throw error;
      }

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

      if (!modal) {
        return;
      }

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

  function setupPublicProfileModal() {
    document
      .querySelectorAll(
        "[data-close-public-profile]"
      )
      .forEach((element) => {
        if (
          element.dataset.bound ===
          "true"
        ) {
          return;
        }

        element.dataset.bound =
          "true";

        element.addEventListener(
          "click",
          closePublicProfile
        );
      });

    const modal =
      $("#public-profile-modal");

    if (
      modal &&
      modal.dataset.bound !== "true"
    ) {
      modal.dataset.bound =
        "true";

      modal.addEventListener(
        "click",
        (event) => {
          if (
            event.target === modal
          ) {
            closePublicProfile();
          }
        }
      );
    }
  }

  /* =========================================================
     PARRAINAGE
  ========================================================= */

  async function loadReferralLink() {
    try {
      const {
        data,
        error
      } = await supabase.rpc(
        "vg_get_my_referral_link"
      );

      if (error) {
        console.error(
          "Lien referral:",
          error
        );

        return;
      }

      const referral =
        firstRow(data);

      if (!referral) {
        return;
      }

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
            element.tagName ===
              "INPUT" ||
            element.tagName ===
              "TEXTAREA"
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
          element.textContent =
            code;
        });

      document
        .querySelectorAll(
          "[data-copy-referral]"
        )
        .forEach((button) => {
          button.onclick =
            async () => {
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

    } catch (error) {
      console.error(
        "Referral:",
        error
      );
    }
  }

  async function processReferralCode() {
    const params =
      new URLSearchParams(
        window.location.search
      );

    const code =
      params.get("ref");

    if (!code) {
      return;
    }

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

    } catch (error) {
      console.error(
        "Referral code:",
        error
      );
    }
  }

  /* =========================================================
     INTERFACE
  ========================================================= */

  function hideLegacyDonationInterface() {
    document
      .querySelectorAll(
        ".donation-section," +
        "[data-donation-section]," +
        "[data-donation-button]," +
        ".donation-button"
      )
      .forEach((element) => {
        element.hidden = true;
      });
  }

  function setupLogout() {
    document
      .querySelectorAll(
        "#logout-button,[data-logout]"
      )
      .forEach((button) => {
        if (
          button.dataset.bound ===
          "true"
        ) {
          return;
        }

        button.dataset.bound =
          "true";

        button.addEventListener(
          "click",
          logout
        );
      });
  }

  function setupRefresh() {
    document
      .querySelectorAll(
        "#refresh-button," +
        "#board-refresh-button"
      )
      .forEach((button) => {
        if (
          button.dataset.bound ===
          "true"
        ) {
          return;
        }

        button.dataset.bound =
          "true";

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
          formatCountdown(
            element.dataset.countdown
          );
      });
  }

  async function logout() {
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.replace(
        "index.html"
      );
    }
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

  /* =========================================================
     RAFRAÎCHISSEMENT
  ========================================================= */

  async function refreshDashboard() {
    showLoading(
      "Actualisation de votre espace..."
    );

    try {
      await loadProfile();

      await loadPlans();

      await loadMyPendingApplication();

      await loadCurrentBoard();

      /*
       * Si aucun membership actif :
       * soit une demande existe,
       * soit il faut proposer l'entrée.
       */
      if (!currentMembership) {
        renderMyPendingApplication();

        if (!pendingApplication) {
          renderJoinFirstPlan();
        }
      }

      await loadLegendApplications();

      await loadReferralLink();

      renderPlans();

      setupPublicProfileModal();

      setupLogout();

      setupRefresh();

      hideLegacyDonationInterface();

      updateCountdowns();

      showApp();

    } catch (error) {
      console.error(
        "Dashboard:",
        error
      );

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

  /* =========================================================
     INITIALISATION
  ========================================================= */

  async function init() {
    hideApp();

    if (!supabase) {
      console.error(
        "Client Supabase introuvable."
      );

      return;
    }

    showLoading(
      "Chargement de votre espace..."
    );

    try {
      const {
        data: {
          session
        }
      } =
        await supabase.auth.getSession();

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

      await loadMyPendingApplication();

      /*
       * C'est ici que le correctif principal
       * intervient :
       *
       * on cherche d'abord une vraie
       * adhésion active avant de considérer
       * l'utilisateur comme "sans tableau".
       */
      await loadCurrentBoard();

      if (!currentMembership) {
        renderMyPendingApplication();

        if (!pendingApplication) {
          renderJoinFirstPlan();
        }
      }

      await loadLegendApplications();

      await loadReferralLink();

      renderPlans();

      setupPublicProfileModal();

      setupLogout();

      setupRefresh();

      hideLegacyDonationInterface();

      updateCountdowns();

      if (
        countdownTimer
      ) {
        clearInterval(
          countdownTimer
        );
      }

      countdownTimer =
        setInterval(
          updateCountdowns,
          1000
        );

      showApp();

    } catch (error) {
      console.error(
        "Initialisation dashboard:",
        error
      );

      notify(
        errorMessage(error),
        "error"
      );

    } finally {
      hideLoading();
    }
  }

  /* =========================================================
     API GLOBALE
  ========================================================= */

  window.VG_APP = {
    refresh:
      refreshDashboard,

    logout,

    openPublicProfile,

    closePublicProfile,

    applyToFirstPlan,

    applyToNextPlan,

    approveApplication,

    recordSimulationProgress
  };

  document.addEventListener(
    "DOMContentLoaded",
    init
  );
})();
