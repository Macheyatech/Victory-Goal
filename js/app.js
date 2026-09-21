(() => {
  "use strict";

  const supabase = window.vgSupabase;

  let currentUser = null;
  let currentProfile = null;
  let viewerUserId = null;

  let visiblePlans = [];
  let currentPlan = null;
  let currentBoard = [];
  let currentMembership = null;

  let currentProgress = 0;
  let requiredProgress = 0;

  let pendingApplication = null;
  let legendApplications = [];

  let boardExpanded = false;
  let countdownTimer = null;

  const $ = (selector) =>
    document.querySelector(selector);

  /* =========================================================
     UTILITAIRES
  ========================================================= */

  function escapeHtml(value) {
    if (window.VG_UI?.escapeHtml) {
      return window.VG_UI.escapeHtml(
        value ?? ""
      );
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

    return `V$${new Intl.NumberFormat(
      "fr-FR",
      {
        maximumFractionDigits: 2
      }
    ).format(
      Number.isFinite(number)
        ? number
        : 0
    )}`;
  }

  function formatDate(value) {
    if (!value) return "—";

    if (window.VG_UI?.formatDate) {
      return window.VG_UI.formatDate(value);
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat(
      "fr-FR",
      {
        dateStyle: "medium",
        timeStyle: "short"
      }
    ).format(date);
  }

  function countdown(value) {
    if (!value) return "—";

    const target =
      new Date(value).getTime();

    const remaining =
      target - Date.now();

    if (
      !Number.isFinite(remaining) ||
      remaining <= 0
    ) {
      return "Expirée";
    }

    const totalSeconds =
      Math.floor(
        remaining / 1000
      );

    const minutes =
      Math.floor(
        totalSeconds / 60
      );

    const seconds =
      totalSeconds % 60;

    return `${minutes} min ${String(
      seconds
    ).padStart(2, "0")} s`;
  }

  function notify(
    message,
    type = "info"
  ) {
    if (window.VG_UI?.notify) {
      window.VG_UI.notify(
        message,
        type
      );
      return;
    }

    alert(message);
  }

  function setText(
    selector,
    value
  ) {
    const element =
      $(selector);

    if (element) {
      element.textContent =
        value ?? "";
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

  function showLoading(message) {
    const loading =
      $("#dashboard-loading");

    if (!loading) return;

    loading.hidden = false;

    const text =
      $("#dashboard-loading-text");

    if (text) {
      text.textContent =
        message;
    }
  }

  function hideLoading() {
    const loading =
      $("#dashboard-loading");

    if (loading) {
      loading.hidden = true;
    }
  }

  function showApp() {
    const app =
      $("#app");

    if (app) {
      app.hidden = false;
    }
  }

  function hideApp() {
    const app =
      $("#app");

    if (app) {
      app.hidden = true;
    }
  }

  function errorMessage(error) {
    const raw = String(
      error?.message ||
      error?.error_description ||
      error ||
      "Une erreur est survenue."
    );

    const text =
      raw.toLowerCase();

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
        "already has",
        "Vous avez déjà une inscription active."
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
        "first plan table is full",
        "Le premier tableau est complet."
      ],
      [
        "no next plan",
        "Aucun niveau supérieur n'est actuellement disponible."
      ],
      [
        "active legend not found",
        "Aucune Légende active n'a été trouvée."
      ]
    ];

    for (
      const [
        search,
        translation
      ] of translations
    ) {
      if (
        text.includes(search)
      ) {
        return translation;
      }
    }

    return raw;
  }

  /* =========================================================
     PROFIL
  ========================================================= */

  async function loadProfile() {
    const {
      data,
      error
    } = await supabase.rpc(
      "vg_get_my_profile"
    );

    if (error) {
      throw error;
    }

    currentProfile =
      firstRow(data);

    if (!currentProfile) {
      throw new Error(
        "PROFILE_NOT_FOUND"
      );
    }

    /*
     * IMPORTANT :
     * Le backend renvoie user_id.
     * On utilise celui-ci comme référence
     * principale au lieu de dépendre uniquement
     * de session.user.id.
     */
    viewerUserId =
      currentProfile.user_id ||
      currentUser?.id ||
      null;

    renderProfile();
  }

  function renderProfile() {
    if (!currentProfile) {
      return;
    }

    setText(
      "#profile-username",
      currentProfile.username ||
        "—"
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
      roleLabel(
        currentProfile.role
      )
    );

    const avatar =
      $("#profile-avatar-letter");

    if (avatar) {
      avatar.textContent =
        String(
          currentProfile.username ||
          "V"
        )
          .charAt(0)
          .toUpperCase();
    }
  }

  /* =========================================================
     PLANS
  ========================================================= */

  async function loadPlans() {
    const {
      data,
      error
    } = await supabase.rpc(
      "vg_get_visible_plans"
    );

    if (error) {
      throw error;
    }

    visiblePlans =
      Array.isArray(data)
        ? [...data].sort(
            (a, b) =>
              Number(
                a.sequence_no
              ) -
              Number(
                b.sequence_no
              )
          )
        : [];

    renderPlans();
  }

  function getPlanColors(plan) {
    return {
      primary:
        plan?.color_primary ||
        "#d4af37",

      secondary:
        plan?.color_secondary ||
        "#8f6b1f"
    };
  }

  function getNextPlan() {
    if (!currentPlan) {
      return null;
    }

    return (
      visiblePlans.find(
        (plan) =>
          Number(
            plan.sequence_no
          ) ===
          Number(
            currentPlan.sequence_no
          ) + 1
      ) || null
    );
  }

  function applyPlanColors(plan) {
    const colors =
      getPlanColors(plan);

    document.documentElement.style.setProperty(
      "--plan-primary",
      colors.primary
    );

    document.documentElement.style.setProperty(
      "--plan-secondary",
      colors.secondary
    );
  }

  function renderPlans() {
    const container =
      $("#plans-list");

    if (!container) {
      return;
    }

    if (!visiblePlans.length) {
      container.innerHTML = `
        <div class="empty-state">
          Aucun niveau disponible pour le moment.
        </div>
      `;

      return;
    }

    const nextPlan =
      getNextPlan();

    container.innerHTML =
      visiblePlans
        .map((plan) => {
          const isCurrent =
            currentPlan?.id ===
            plan.id;

          const isNext =
            nextPlan?.id ===
            plan.id;

          const colors =
            getPlanColors(plan);

          return `
            <article
              class="
                plan-card
                ${isCurrent ? "active" : ""}
                ${isNext ? "locked" : ""}
              "
              style="
                --card-primary:${escapeHtml(
                  colors.primary
                )};
                --card-secondary:${escapeHtml(
                  colors.secondary
                )};
              "
            >

              <div class="plan-card-header">

                <div>
                  <h3>
                    ${escapeHtml(
                      plan.name ||
                      "Niveau"
                    )}
                  </h3>

                  <span>
                    Niveau
                    ${Number(
                      plan.sequence_no ||
                      0
                    )}
                  </span>
                </div>

                <strong class="plan-points">
                  ${points(
                    plan.plan_points
                  )}
                </strong>

              </div>

              <div class="plan-card-body">

                <p>
                  Progression requise :
                  <strong>
                    ${Number(
                      plan.required_progress ||
                      0
                    )}
                  </strong>
                </p>

                ${
                  isCurrent
                    ? `
                      <div class="plan-status current">
                        Niveau actuel
                      </div>
                    `
                    : isNext
                    ? `
                      <div class="plan-status locked">
                        🔒 Prochain niveau
                      </div>
                    `
                    : `
                      <div class="plan-status completed">
                        Niveau du parcours
                      </div>
                    `
                }

              </div>

            </article>
          `;
        })
        .join("");
  }

  /* =========================================================
     TABLEAU
  ========================================================= */

  function findActiveMembership(
    board
  ) {
    if (
      !Array.isArray(board) ||
      !viewerUserId
    ) {
      return null;
    }

    return (
      board.find(
        (row) =>
          row.user_id ===
            viewerUserId &&
          row.membership_id &&
          row.membership_status ===
            "active"
      ) || null
    );
  }

  async function loadCurrentBoard() {
    currentPlan = null;
    currentBoard = [];
    currentMembership = null;

    /*
     * On cherche d'abord le tableau
     * auquel l'utilisateur appartient.
     */
    const plans =
      [...visiblePlans].sort(
        (a, b) =>
          Number(
            b.sequence_no
          ) -
          Number(
            a.sequence_no
          )
      );

    for (
      const plan of plans
    ) {
      try {
        const {
          data,
          error
        } = await supabase.rpc(
          "vg_get_board",
          {
            p_plan_id:
              plan.id
          }
        );

        if (error) {
          continue;
        }

        const board =
          Array.isArray(data)
            ? data
            : [];

        if (!board.length) {
          continue;
        }

        const membership =
          findActiveMembership(
            board
          );

        /*
         * TROUVE !
         */
        if (membership) {
          currentPlan =
            plan;

          currentBoard =
            board;

          currentMembership =
            membership;

          break;
        }

      } catch (error) {
        console.error(
          "Erreur tableau:",
          error
        );
      }
    }

    /*
     * Si aucun tableau n'est trouvé,
     * alors seulement on considère
     * l'utilisateur comme sans tableau.
     */
    if (!currentPlan) {
      currentBoard = [];
      currentMembership = null;

      renderNoBoard();

      return;
    }

    applyPlanColors(
      currentPlan
    );

    calculateProgress();

    renderCurrentPlan();
    renderBoard();
  }

  function calculateProgress() {
    if (!currentPlan) {
      currentProgress = 0;
      requiredProgress = 0;
      return;
    }

    requiredProgress =
      Number(
        currentPlan.required_progress ||
        8
      );

    /*
     * Genesis = positions 2 à 9.
     * Branch = positions 5 à 12.
     */
    const branch =
      currentBoard.some(
        (row) =>
          Number(
            row.position_no
          ) >= 12
      );

    const firstPosition =
      branch ? 5 : 2;

    currentProgress =
      currentBoard.filter(
        (row) =>
          row.membership_id &&
          row.membership_status ===
            "active" &&
          Number(
            row.position_no
          ) >= firstPosition
      ).length;

    currentProgress =
      Math.min(
        currentProgress,
        requiredProgress
      );
  }

  function renderBoard() {
    const container =
      $("#board-container");

    if (!container) {
      return;
    }

    if (
      !currentPlan ||
      !currentBoard.length
    ) {
      renderNoBoard();
      return;
    }

    const positions =
      new Map();

    currentBoard.forEach(
      (row) => {
        positions.set(
          Number(
            row.position_no
          ),
          row
        );
      }
    );

    const isBranch =
      currentBoard.some(
        (row) =>
          Number(
            row.position_no
          ) >= 12
      );

    const maxPosition =
      isBranch ? 12 : 9;

    const colors =
      getPlanColors(
        currentPlan
      );

    const nodes = [];

    for (
      let position = 1;
      position <= maxPosition;
      position++
    ) {
      nodes.push(
        renderBoardNode(
          positions.get(
            position
          ),
          position
        )
      );
    }

    container.innerHTML = `
      <div
        class="victory-board"
        style="
          --board-primary:${escapeHtml(
            colors.primary
          )};
          --board-secondary:${escapeHtml(
            colors.secondary
          )};
        "
      >
        ${nodes.join("")}
      </div>
    `;

    container.hidden =
      !boardExpanded;

    setText(
      "#board-plan-name",
      currentPlan.name ||
        "—"
    );

    setText(
      "#board-division-name",
      isBranch
        ? "Division de branche"
        : "Table Genesis"
    );

    bindBoardNames();
    setupBoardToggle();
  }

  function renderBoardNode(
    row,
    position
  ) {
    /*
     * IMPORTANT :
     * Une position vide ne contient
     * absolument aucun texte.
     */
    if (!row) {
      return `
        <div
          class="board-node empty"
          data-position="${position}"
        ></div>
      `;
    }

    /*
     * DEMANDE EN ATTENTE
     */
    if (
      !row.membership_id &&
      row.pending_application_id
    ) {
      const username =
        row.username ||
        "En attente";

      return `
        <div
          class="board-node pending"
          data-position="${position}"
        >

          <span class="board-username">
            ${escapeHtml(
              username
            )}
          </span>

          <span class="board-pending">
            En attente
          </span>

        </div>
      `;
    }

    /*
     * MEMBRE ACTIF
     */
    if (row.membership_id) {
      const username =
        row.username ||
        "Membre";

      const role =
        roleLabel(
          row.member_role
        );

      const isMe =
        row.user_id ===
        viewerUserId;

      if (!isMe) {
        return `
          <div
            class="board-node occupied"
            data-position="${position}"
          >

            <button
              type="button"
              class="board-username"
              data-public-profile="${escapeHtml(
                row.user_id
              )}"
            >
              ${escapeHtml(
                username
              )}
            </button>

            <span class="board-role">
              ${escapeHtml(
                role
              )}
            </span>

          </div>
        `;
      }

      return `
        <div
          class="
            board-node
            occupied
            current-user
          "
          data-position="${position}"
        >

          <span class="board-username">
            ${escapeHtml(
              username
            )}
          </span>

          <span class="board-role">
            ${escapeHtml(
              role
            )}
          </span>

        </div>
      `;
    }

    return `
      <div
        class="board-node empty"
        data-position="${position}"
      ></div>
    `;
  }

  function bindBoardNames() {
    document
      .querySelectorAll(
        "[data-public-profile]"
      )
      .forEach(
        (button) => {
          button.addEventListener(
            "click",
            () => {
              openPublicProfile(
                button.dataset
                  .publicProfile
              );
            }
          );
        }
      );
  }

  function setupBoardToggle() {
    const info =
      $("#board-plan-info");

    if (!info) {
      return;
    }

    if (
      info.dataset.bound ===
      "true"
    ) {
      return;
    }

    info.dataset.bound =
      "true";

    info.style.cursor =
      "pointer";

    info.addEventListener(
      "click",
      () => {
        toggleBoard();
      }
    );
  }

  function toggleBoard() {
    if (
      !currentMembership ||
      !currentBoard.length
    ) {
      return;
    }

    boardExpanded =
      !boardExpanded;

    const container =
      $("#board-container");

    if (container) {
      container.hidden =
        !boardExpanded;
    }

    const info =
      $("#board-plan-info");

    if (info) {
      info.setAttribute(
        "aria-expanded",
        boardExpanded
          ? "true"
          : "false"
      );
    }
  }

  function renderNoBoard() {
    const container =
      $("#board-container");

    if (!container) {
      return;
    }

    setText(
      "#board-plan-name",
      "—"
    );

    setText(
      "#board-division-name",
      "—"
    );

    /*
     * Si Genesis ou un autre membre
     * possède réellement un membership,
     * cette fonction ne doit jamais être appelée.
     */
    if (currentMembership) {
      return;
    }

    container.hidden = false;

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
            Niveau V$1
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

    $(
      "#apply-first-plan-button"
    )?.addEventListener(
      "click",
      applyToFirstPlan
    );
  }

  /* =========================================================
     PROGRESSION
  ========================================================= */

  function renderCurrentPlan() {
    if (!currentPlan) {
      return;
    }

    const required =
      Number(
        currentPlan.required_progress ||
        8
      );

    const progress =
      Math.min(
        currentProgress,
        required
      );

    const percentage =
      required > 0
        ? Math.round(
            (
              progress /
              required
            ) * 100
          )
        : 0;

    setText(
      "#current-plan-name",
      currentPlan.name ||
        "—"
    );

    setText(
      "#current-plan-points",
      points(
        currentPlan.plan_points
      )
    );

    setText(
      "#progress-value",
      `${progress} / ${required}`
    );

    setText(
      "#progress-count",
      String(progress)
    );

    setText(
      "#required-progress",
      String(required)
    );

    document
      .querySelectorAll(
        "[data-progress-fill]"
      )
      .forEach(
        (element) => {
          element.style.width =
            `${percentage}%`;
        }
      );

    document
      .querySelectorAll(
        "[data-progress-percent]"
      )
      .forEach(
        (element) => {
          element.textContent =
            `${percentage}%`;
        }
      );

    renderNextPlan();
    renderSimulationProgress();
  }

  function renderSimulationProgress() {
    const area =
      $("#simulation-progress-area");

    if (!area) {
      return;
    }

    const role =
      currentMembership?.member_role;

    if (
      role !== "legend"
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
          </p>
        </div>

        <button
          type="button"
          id="simulation-progress-button"
          class="primary-button"
          ${
            complete
              ? "disabled"
              : ""
          }
        >
          ${
            complete
              ? "Progression terminée"
              : "Enregistrer une progression"
          }
        </button>

      </div>
    `;

    $(
      "#simulation-progress-button"
    )?.addEventListener(
      "click",
      recordSimulationProgress
    );
  }

  function renderNextPlan() {
    const section =
      $("#next-plan-section");

    const area =
      $("#next-plan-area");

    if (!section || !area) {
      return;
    }

    const next =
      getNextPlan();

    if (!next) {
      section.hidden = true;
      return;
    }

    section.hidden = false;

    const complete =
      currentProgress >=
      requiredProgress;

    area.innerHTML = `
      <div class="next-plan-card locked">

        <div class="next-plan-lock">
          🔒
        </div>

        <div class="next-plan-details">

          <span class="card-kicker">
            PROCHAIN NIVEAU
          </span>

          <strong>
            ${escapeHtml(
              next.name
            )}
          </strong>

          <span>
            ${points(
              next.plan_points
            )}
          </span>

          <p>
            ${
              complete
                ? "Votre progression est terminée. L'accès suit le processus de validation prévu."
                : "Ce niveau reste verrouillé jusqu'à la fin des conditions du niveau actuel."
            }
          </p>

        </div>

        <span class="next-plan-status">
          ${
            complete
              ? "Processus d'accès"
              : "Accès verrouillé"
          }
        </span>

      </div>
    `;
  }

  /* =========================================================
     DEMANDE PREMIER TABLEAU
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
      const {
        error
      } = await supabase.rpc(
        "vg_apply_to_first_plan"
      );

      if (error) {
        throw error;
      }

      notify(
        "Votre demande a été envoyée à la Légende.",
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
     DEMANDE SUIVANTE
  ========================================================= */

  async function loadPendingApplication() {
    pendingApplication = null;

    if (!viewerUserId) {
      return;
    }

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
          target_cycle_id,
          target_position_no,
          status,
          expires_at,
          created_at
        `)
        .eq(
          "user_id",
          viewerUserId
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

      if (
        !error &&
        Array.isArray(data) &&
        data.length
      ) {
        pendingApplication =
          data[0];
      }

    } catch (error) {
      console.error(
        "Pending:",
        error
      );
    }

    renderPendingApplication();
  }

  function renderPendingApplication() {
    const section =
      $("#pending-section");

    const content =
      $("#pending-content");

    if (
      !section ||
      !content
    ) {
      return;
    }

    /*
     * Si la personne est déjà membre,
     * sa demande n'est plus affichée.
     */
    if (
      currentMembership ||
      !pendingApplication
    ) {
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

          <span
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

  /* =========================================================
     DEMANDES POUR LA LÉGENDE
  ========================================================= */

  async function loadLegendApplications() {
    legendApplications = [];

    if (
      !currentMembership ||
      currentMembership.member_role !==
        "legend"
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

      if (!error) {
        legendApplications =
          Array.isArray(data)
            ? data
            : [];
      }

    } catch (error) {
      console.error(
        "Approvals:",
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

    if (
      !section ||
      !list
    ) {
      return;
    }

    if (
      !currentMembership ||
      currentMembership.member_role !==
        "legend"
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
        .map(
          (application) => `
            <article class="approval-card">

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
          `
        )
        .join("");

    list
      .querySelectorAll(
        ".approve-application-button"
      )
      .forEach(
        (button) => {
          button.addEventListener(
            "click",
            () =>
              approveApplication(
                button.dataset
                  .applicationId,
                button
              )
          );
        }
      );
  }

  async function approveApplication(
    applicationId,
    button
  ) {
    if (button) {
      button.disabled = true;
      button.textContent =
        "Approbation...";
    }

    try {
      const {
        error
      } = await supabase.rpc(
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
        "Demande approuvée.",
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
     PROGRESSION
  ========================================================= */

  async function recordSimulationProgress() {
    if (
      !currentMembership?.membership_id
    ) {
      return;
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
        firstRow(data) ||
        data;

      notify(
        result?.completed
          ? "Progression terminée."
          : "Progression enregistrée.",
        "success"
      );

      await refreshDashboard();

    } catch (error) {
      notify(
        errorMessage(error),
        "error"
      );
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
          p_user_id:
            userId
        }
      );

      if (error) {
        throw error;
      }

      const profile =
        firstRow(data);

      if (!profile) {
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
          profile.username ||
          "—";
      }

      if (phone) {
        phone.textContent =
          profile.phone ||
          "—";
      }

      if (role) {
        role.textContent =
          roleLabel(
            profile.role
          );
      }

      modal.hidden = false;

      modal.classList.add(
        "open"
      );

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

    if (!modal) {
      return;
    }

    modal.hidden = true;

    modal.classList.remove(
      "open"
    );

    modal.setAttribute(
      "aria-hidden",
      "true"
    );
  }

  function setupPublicProfile() {
    document
      .querySelectorAll(
        "[data-close-public-profile]"
      )
      .forEach(
        (element) => {
          element.addEventListener(
            "click",
            closePublicProfile
          );
        }
      );
  }

  /* =========================================================
     PARRAINAGE
  ========================================================= */

  async function loadReferral() {
    try {
      const {
        data,
        error
      } = await supabase.rpc(
        "vg_get_my_referral_link"
      );

      if (error) {
        return;
      }

      const referral =
        firstRow(data);

      if (!referral) {
        return;
      }

      const url =
        referral.referral_url ||
        "";

      const code =
        referral.referral_code ||
        "";

      document
        .querySelectorAll(
          "[data-referral-code]"
        )
        .forEach(
          (element) => {
            element.textContent =
              code;
          }
        );

      document
        .querySelectorAll(
          "[data-referral-link]"
        )
        .forEach(
          (element) => {
            element.value =
              url;
          }
        );

      document
        .querySelectorAll(
          "[data-copy-referral]"
        )
        .forEach(
          (button) => {
            button.onclick =
              async () => {
                try {
                  await navigator.clipboard.writeText(
                    url
                  );

                  notify(
                    "Lien copié.",
                    "success"
                  );
                } catch {}
              };
          }
        );

    } catch {}
  }

  /* =========================================================
     INTERFACE
  ========================================================= */

  function setupLogout() {
    $(
      "#logout-button"
    )?.addEventListener(
      "click",
      async () => {
        await supabase.auth.signOut();

        window.location.replace(
          "index.html"
        );
      }
    );
  }

  function setupRefresh() {
    document
      .querySelectorAll(
        "#refresh-button,#board-refresh-button"
      )
      .forEach(
        (button) => {
          button.addEventListener(
            "click",
            refreshDashboard
          );
        }
      );
  }

  function updateCountdowns() {
    document
      .querySelectorAll(
        "[data-countdown]"
      )
      .forEach(
        (element) => {
          element.textContent =
            countdown(
              element.dataset
                .countdown
            );
        }
      );
  }

  /* =========================================================
     REFRESH
  ========================================================= */

  async function refreshDashboard() {
    showLoading(
      "Actualisation..."
    );

    try {
      await loadProfile();
      await loadPlans();
      await loadPendingApplication();
      await loadCurrentBoard();

      /*
       * Seulement un utilisateur
       * sans membership peut demander
       * le premier tableau.
       */
      if (
        !currentMembership &&
        !pendingApplication
      ) {
        renderNoBoard();
      }

      await loadLegendApplications();
      await loadReferral();

      renderPlans();
      renderPendingApplication();

      setupPublicProfile();
      setupLogout();
      setupRefresh();

      updateCountdowns();

      showApp();

    } catch (error) {
      console.error(error);

      if (
        error?.message ===
        "PROFILE_NOT_FOUND"
      ) {
        await supabase.auth.signOut();

        window.location.replace(
          "index.html?create=1"
        );

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
     INIT
  ========================================================= */

  async function init() {
    hideApp();

    if (!supabase) {
      console.error(
        "Supabase introuvable."
      );

      return;
    }

    showLoading(
      "Chargement..."
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

      /*
       * 1. Profil
       * 2. user_id réel du profil
       * 3. Plans
       * 4. Tableau
       */
      await loadProfile();

      await loadPlans();

      await loadPendingApplication();

      await loadCurrentBoard();

      /*
       * IMPORTANT :
       * Genesis a déjà un membership.
       * Donc cette section ne doit jamais
       * apparaître pour Genesis.
       */
      if (
        !currentMembership &&
        !pendingApplication
      ) {
        renderNoBoard();
      }

      await loadLegendApplications();

      await loadReferral();

      renderPlans();
      renderPendingApplication();

      setupPublicProfile();
      setupLogout();
      setupRefresh();

      updateCountdowns();

      if (countdownTimer) {
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
        "Dashboard error:",
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

  window.VG_APP = {
    refresh:
      refreshDashboard,

    openPublicProfile,

    closePublicProfile,

    applyToFirstPlan,

    approveApplication,

    recordSimulationProgress,

    toggleBoard
  };

  document.addEventListener(
    "DOMContentLoaded",
    init
  );
})();
