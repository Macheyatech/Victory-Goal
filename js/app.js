const supabaseClient = window.vgSupabase;

let currentUser = null;
let currentProfile = null;
let visiblePlans = [];
let currentPlan = null;
let currentBoard = [];
let pendingApplication = null;
let confirmCallback = null;

const $ = (id) => document.getElementById(id);

function firstRow(data) {
  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data || null;
}

function rows(data) {
  if (Array.isArray(data)) {
    return data;
  }

  return data ? [data] : [];
}

function escapeHtml(value) {
  return window.VG_UI.escapeHtml(value ?? "");
}

function roleLabel(role) {
  const labels = {
    legend: "Légende",
    constructor: "Constructeur",
    member: "Membre"
  };

  return labels[role] || "Membre";
}

function statusLabel(status) {
  const labels = {
    active: "Actif",
    pending: "En attente",
    completed: "Terminé",
    suspended: "Suspendu"
  };

  return labels[status] || status || "—";
}

function showApp() {
  const loading = $("app-loading");
  const app = $("app");

  if (loading) {
    loading.hidden = true;
  }

  if (app) {
    app.hidden = false;
  }
}

function showLoading() {
  const loading = $("app-loading");

  if (loading) {
    loading.hidden = false;
  }
}

function showDashboardError(message) {
  showApp();

  if (window.VG_UI) {
    window.VG_UI.notify(message, "error");
  }
}

async function getSession() {
  const {
    data,
    error
  } = await supabaseClient.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
}

async function loadProfile() {
  const {
    data,
    error
  } = await supabaseClient.rpc(
    "vg_get_my_profile"
  );

  if (error) {
    throw error;
  }

  currentProfile = firstRow(data);

  if (!currentProfile) {
    throw new Error("Profil utilisateur introuvable.");
  }

  renderProfile();
}

function renderProfile() {
  const username =
    currentProfile.username || "Utilisateur";

  const phone =
    currentProfile.phone || "Non renseigné";

  const role =
    roleLabel(currentProfile.role);

  window.VG_UI.setText(
    $("profile-username"),
    username
  );

  window.VG_UI.setText(
    $("profile-phone"),
    `Téléphone : ${phone}`
  );

  window.VG_UI.setText(
    $("profile-email"),
    `E-mail : ${currentUser?.email || "—"}`
  );

  window.VG_UI.setText(
    $("profile-role"),
    role
  );

  window.VG_UI.setText(
    $("profile-avatar-letter"),
    username.charAt(0).toUpperCase()
  );

  window.VG_UI.setText(
    $("welcome-title"),
    `Bienvenue, ${username}`
  );
}

async function loadPlans() {
  const {
    data,
    error
  } = await supabaseClient.rpc(
    "vg_get_visible_plans"
  );

  if (error) {
    throw error;
  }

  visiblePlans = rows(data);

  visiblePlans.sort(
    (a, b) =>
      Number(a.sequence_no || 0) -
      Number(b.sequence_no || 0)
  );

  renderPlans();
}

function renderPlans() {
  const container = $("plans-list");

  if (!container) return;

  if (!visiblePlans.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Aucun plan disponible.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = visiblePlans
    .map((plan) => {
      const sequence =
        Number(plan.sequence_no || 0);

      const amount =
        window.VG_UI.formatAmount(plan.amount);

      const isCurrent =
        currentPlan &&
        plan.id === currentPlan.id;

      return `
        <article
          class="plan-item ${isCurrent ? "current" : ""}"
          data-plan-id="${escapeHtml(plan.id)}"
          style="
            --plan-primary: ${escapeHtml(
              plan.color_primary || "#168cff"
            )};
            --plan-secondary: ${escapeHtml(
              plan.color_secondary || "#39b9ff"
            )};
          ">

          <div class="plan-item-number">
            ${sequence}
          </div>

          <div class="plan-item-info">

            <span>
              Plan ${sequence}
            </span>

            <strong>
              ${amount}
            </strong>

          </div>

          <div class="plan-item-status">
            ${
              isCurrent
                ? "Actuel"
                : "Accessible"
            }
          </div>

        </article>
      `;
    })
    .join("");
}

async function loadCurrentBoard() {
  currentPlan = null;
  currentBoard = [];

  const orderedPlans = [...visiblePlans]
    .sort(
      (a, b) =>
        Number(b.sequence_no || 0) -
        Number(a.sequence_no || 0)
    );

  for (const plan of orderedPlans) {
    const {
      data,
      error
    } = await supabaseClient.rpc(
      "vg_get_board",
      {
        p_plan_id: plan.id
      }
    );

    if (error) {
      continue;
    }

    const boardRows = rows(data);

    if (boardRows.length) {
      currentPlan = plan;
      currentBoard = boardRows;
      break;
    }
  }

  if (currentPlan) {
    renderCurrentPlan();
    renderBoard();
  } else {
    renderNoCurrentPlan();
  }
}

function renderCurrentPlan() {
  if (!currentPlan) return;

  window.VG_UI.setText(
    $("current-plan-name"),
    window.VG_UI.formatAmount(currentPlan.amount)
  );

  window.VG_UI.setText(
    $("board-plan-name"),
    `Plan ${currentPlan.sequence_no} — ${window.VG_UI.formatAmount(currentPlan.amount)}`
  );

  const first =
    currentBoard.find(
      (item) =>
        item.user_id === currentUser?.id &&
        item.status === "active"
    );

  const received =
    Number(
      first?.received_donations ??
      first?.donation_count ??
      first?.donations_received ??
      0
    );

  const required =
    Number(
      currentPlan.required_donations || 8
    );

  const percentage =
    Math.min(
      100,
      Math.max(
        0,
        (received / required) * 100
      )
    );

  window.VG_UI.setText(
    $("donation-count"),
    `${received} / ${required}`
  );

  const progress =
    $("donation-progress");

  if (progress) {
    progress.style.width =
      `${percentage}%`;
  }

  const division =
    currentBoard[0]?.division_no;

  const table =
    currentBoard[0]?.table_no;

  window.VG_UI.setText(
    $("board-division-name"),
    division
      ? `Division ${division}${table ? ` • Tableau ${table}` : ""}`
      : "Division actuelle"
  );

  renderNextPlanSection();
}

function renderNoCurrentPlan() {
  window.VG_UI.setText(
    $("current-plan-name"),
    "Aucun plan"
  );

  window.VG_UI.setText(
    $("donation-count"),
    "0 / 8"
  );

  const progress =
    $("donation-progress");

  if (progress) {
    progress.style.width = "0%";
  }

  window.VG_UI.setText(
    $("board-plan-name"),
    "Aucun plan"
  );

  window.VG_UI.setText(
    $("board-division-name"),
    "—"
  );

  const container =
    $("board-container");

  if (container) {
    container.innerHTML = `
      <div class="empty-state">
        <p>
          Vous n'avez pas encore rejoint un plan.
        </p>

        <button
          type="button"
          class="primary-button"
          id="first-plan-button">
          Commencer le parcours
        </button>
      </div>
    `;

    const button =
      $("first-plan-button");

    if (button) {
      button.addEventListener(
        "click",
        applyToFirstPlan
      );
    }
  }

  const nextSection =
    $("next-plan-section");

  if (nextSection) {
    nextSection.hidden = true;
  }
}

function renderNextPlanSection() {
  const section =
    $("next-plan-section");

  if (!section || !currentPlan) {
    return;
  }

  const currentSequence =
    Number(currentPlan.sequence_no || 0);

  const nextPlan =
    visiblePlans.find(
      (plan) =>
        Number(plan.sequence_no || 0) ===
        currentSequence + 1
    );

  if (!nextPlan) {
    section.hidden = true;
    return;
  }

  section.hidden = false;

  window.VG_UI.setText(
    $("next-plan-description"),
    `Prochain plan : ${window.VG_UI.formatAmount(nextPlan.amount)}. Votre progression doit respecter l'ordre des plans.`
  );
}

function slotTypeLabel(slotType) {
  const labels = {
    legend: "Légende",
    constructor_top: "Constructeur",
    member_top: "Membre",
    constructor_bottom: "Constructeur",
    member_bottom: "Membre"
  };

  return labels[slotType] || "Membre";
}

function getBoardMember(item) {
  return {
    userId:
      item.user_id ||
      item.member_user_id ||
      item.applicant_user_id ||
      null,

    username:
      item.username ||
      item.member_username ||
      item.applicant_username ||
      null,

    phone:
      item.phone ||
      item.member_phone ||
      item.applicant_phone ||
      null,

    role:
      item.role ||
      item.member_role ||
      null,

    status:
      item.status ||
      "active",

    slotType:
      item.slot_type ||
      "member_top",

    position:
      Number(
        item.position_no ||
        item.display_order ||
        0
      ),

    pending:
      item.status === "pending" ||
      Boolean(item.application_id),

    applicationId:
      item.application_id || null
  };
}

function renderBoard() {
  const container =
    $("board-container");

  if (!container) return;

  if (!currentBoard.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>
          Aucun membre n'est actuellement affiché.
        </p>
      </div>
    `;

    return;
  }

  const members =
    currentBoard.map(getBoardMember);

  const legend =
    members.find(
      (member) =>
        member.slotType === "legend" ||
        member.role === "legend"
    );

  const topConstructor =
    members.find(
      (member) =>
        member.slotType === "constructor_top"
    );

  const bottomConstructor =
    members.find(
      (member) =>
        member.slotType === "constructor_bottom"
    );

  const topMembers =
    members.filter(
      (member) =>
        member.slotType === "member_top"
    );

  const bottomMembers =
    members.filter(
      (member) =>
        member.slotType === "member_bottom"
    );

  container.innerHTML = `
    <div class="vg-board">

      <div class="board-branch board-branch-top">

        ${renderBoardNode(
          topConstructor,
          "constructor"
        )}

        <div class="board-members">
          ${topMembers
            .map(
              (member) =>
                renderBoardNode(
                  member,
                  "member"
                )
            )
            .join("")}
        </div>

      </div>

      <div class="board-center">

        ${renderBoardNode(
          legend,
          "legend"
        )}

      </div>

      <div class="board-branch board-branch-bottom">

        ${renderBoardNode(
          bottomConstructor,
          "constructor"
        )}

        <div class="board-members">
          ${bottomMembers
            .map(
              (member) =>
                renderBoardNode(
                  member,
                  "member"
                )
            )
            .join("")}
        </div>

      </div>

    </div>
  `;

  container
    .querySelectorAll(
      "[data-profile-id]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () =>
          openPublicProfile(
            button.dataset.profileId
          )
      );
    });

  container
    .querySelectorAll(
      "[data-donation-id]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () =>
          openDonationConfirmation(
            button.dataset.donationId,
            button.dataset.username
          )
      );
    });
}

function renderBoardNode(member, type) {
  if (!member) {
    return `
      <div class="board-node board-node-empty">
        <span>Libre</span>
      </div>
    `;
  }

  const isPending =
    member.pending ||
    member.status === "pending";

  const username =
    member.username ||
    "En attente";

  const canDonate =
    member.userId &&
    !isPending &&
    member.userId !== currentUser?.id;

  const nodeClass =
    isPending
      ? "pending"
      : type;

  const safeUserId =
    escapeHtml(member.userId || "");

  return `
    <div
      class="board-node board-node-${nodeClass}">

      <div class="board-node-inner">

        <span class="board-node-type">
          ${
            isPending
              ? "En attente"
              : slotTypeLabel(
                  member.slotType
                )
          }
        </span>

        ${
          member.userId
            ? `
              <button
                type="button"
                class="board-username"
                data-profile-id="${safeUserId}">
                ${escapeHtml(username)}
              </button>
            `
            : `
              <span class="board-username">
                ${escapeHtml(username)}
              </span>
            `
        }

        ${
          isPending
            ? `
              <span class="board-node-status">
                Demande en attente
              </span>
            `
            : `
              <span class="board-node-status">
                ${statusLabel(member.status)}
              </span>
            `
        }

        ${
          canDonate
            ? `
              <button
                type="button"
                class="donation-button"
                data-donation-id="${safeUserId}"
                data-username="${escapeHtml(username)}">
                Donation virtuelle
              </button>
            `
            : ""
        }

      </div>

    </div>
  `;
}

async function openPublicProfile(userId) {
  if (!userId) return;

  try {
    const {
      data,
      error
    } = await supabaseClient.rpc(
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
      window.VG_UI.notify(
        "Ce profil n'est pas accessible.",
        "error"
      );
      return;
    }

    window.VG_UI.setText(
      $("public-profile-title"),
      profile.username || "Membre"
    );

    window.VG_UI.setText(
      $("public-profile-phone"),
      profile.phone || "Non renseigné"
    );

    window.VG_UI.setText(
      $("public-profile-role"),
      roleLabel(profile.role)
    );

    window.VG_UI.setText(
      $("public-profile-letter"),
      (profile.username || "V")
        .charAt(0)
        .toUpperCase()
    );

    openModal("profile-modal");
  } catch (error) {
    window.VG_UI.notify(
      "Impossible d'afficher ce profil.",
      "error"
    );
  }
}

function openModal(id) {
  const modal = $(id);

  if (!modal) return;

  modal.hidden = false;
  modal.setAttribute(
    "aria-hidden",
    "false"
  );

  document.body.classList.add(
    "modal-open"
  );
}

function closeModal(id) {
  const modal = $(id);

  if (!modal) return;

  modal.hidden = true;
  modal.setAttribute(
    "aria-hidden",
    "true"
  );

  document.body.classList.remove(
    "modal-open"
  );
}

function setupModals() {
  $("profile-modal-close")?.addEventListener(
    "click",
    () => closeModal("profile-modal")
  );

  $("confirm-modal-close")?.addEventListener(
    "click",
    () => closeModal("confirm-modal")
  );

  document
    .querySelectorAll("[data-close-modal]")
    .forEach((element) => {
      element.addEventListener(
        "click",
        () => closeModal("profile-modal")
      );
    });

  document
    .querySelectorAll("[data-close-confirm]")
    .forEach((element) => {
      element.addEventListener(
        "click",
        () => closeModal("confirm-modal")
      );
    });

  $("confirm-cancel")?.addEventListener(
    "click",
    () => {
      closeModal("confirm-modal");
      confirmCallback = null;
    }
  );

  $("confirm-action")?.addEventListener(
    "click",
    async () => {
      if (!confirmCallback) return;

      const callback =
        confirmCallback;

      confirmCallback = null;

      closeModal("confirm-modal");

      await callback();
    }
  );
}

function openDonationConfirmation(
  recipientUserId,
  username
) {
  const message =
    `Effectuer une donation virtuelle à ${username} ?`;

  window.VG_UI.setText(
    $("confirm-message"),
    message
  );

  confirmCallback =
    () =>
      recordVirtualDonation(
        recipientUserId
      );

  openModal("confirm-modal");
}

async function recordVirtualDonation(
  recipientUserId
) {
  if (!recipientUserId) return;

  const button =
    $("confirm-action");

  window.VG_UI.loading(
    button,
    true
  );

  try {
    const {
      data,
      error
    } = await supabaseClient.rpc(
      "vg_record_virtual_donation",
      {
        p_recipient_membership_id:
          recipientUserId
      }
    );

    if (error) {
      throw error;
    }

    window.VG_UI.notify(
      "Donation virtuelle enregistrée.",
      "success"
    );

    await refreshDashboard();
  } catch (error) {
    window.VG_UI.notify(
      translateRpcError(error),
      "error"
    );
  } finally {
    window.VG_UI.loading(
      button,
      false
    );
  }
}

function translateRpcError(error) {
  const message =
    String(
      error?.message || ""
    ).toLowerCase();

  if (
    message.includes("self") ||
    message.includes("same user")
  ) {
    return "Vous ne pouvez pas effectuer une donation à vous-même.";
  }

  if (
    message.includes("not active") ||
    message.includes("active membership")
  ) {
    return "Ce membre n'est pas actif dans votre tableau.";
  }

  if (
    message.includes("same plan")
  ) {
    return "La donation doit rester dans votre plan actuel.";
  }

  if (
    message.includes("permission") ||
    message.includes("not allowed")
  ) {
    return "Cette action n'est pas autorisée.";
  }

  if (
    message.includes("pending")
  ) {
    return "Cette demande est encore en attente.";
  }

  return (
    error?.message ||
    "L'action n'a pas pu être effectuée."
  );
}

async function applyToFirstPlan() {
  const button =
    $("first-plan-button");

  if (button) {
    window.VG_UI.loading(
      button,
      true
    );
  }

  try {
    const {
      data,
      error
    } = await supabaseClient.rpc(
      "vg_apply_to_first_plan"
    );

    if (error) {
      throw error;
    }

    window.VG_UI.notify(
      "Votre demande pour le premier plan a été envoyée.",
      "success"
    );

    await refreshDashboard();
  } catch (error) {
    window.VG_UI.notify(
      translateRpcError(error),
      "error"
    );
  } finally {
    if (button) {
      window.VG_UI.loading(
        button,
        false
      );
    }
  }
}

async function applyToNextPlan() {
  const button =
    $("apply-next-plan-button");

  window.VG_UI.loading(
    button,
    true
  );

  try {
    const {
      data,
      error
    } = await supabaseClient.rpc(
      "vg_apply_to_next_plan"
    );

    if (error) {
      throw error;
    }

    pendingApplication =
      firstRow(data);

    window.VG_UI.notify(
      "Votre demande pour le prochain plan a été envoyée.",
      "success"
    );

    await refreshDashboard();
  } catch (error) {
    window.VG_UI.notify(
      translateRpcError(error),
      "error"
    );
  } finally {
    window.VG_UI.loading(
      button,
      false
    );
  }
}

function setupActions() {
  $("logout-button")?.addEventListener(
    "click",
    logout
  );

  $("refresh-button")?.addEventListener(
    "click",
    refreshDashboard
  );

  $("board-refresh-button")?.addEventListener(
    "click",
    refreshDashboard
  );

  $("apply-next-plan-button")?.addEventListener(
    "click",
    applyToNextPlan
  );
}

async function logout() {
  try {
    const {
      error
    } = await supabaseClient.auth.signOut();

    if (error) {
      throw error;
    }

    window.location.replace(
      "index.html"
    );
  } catch (error) {
    window.VG_UI.notify(
      "Impossible de vous déconnecter.",
      "error"
    );
  }
}

async function refreshDashboard() {
  try {
    showLoading();

    const session =
      await getSession();

    if (!session?.user) {
      window.location.replace(
        "index.html"
      );
      return;
    }

    currentUser =
      session.user;

    await loadProfile();
    await loadPlans();
    await loadCurrentBoard();

    showApp();
  } catch (error) {
    console.error(error);

    showDashboardError(
      "Impossible de charger votre espace. Veuillez réessayer."
    );
  }
}

function setupAuthListener() {
  supabaseClient.auth.onAuthStateChange(
    (event, session) => {
      if (
        event === "SIGNED_OUT" ||
        !session
      ) {
        window.location.replace(
          "index.html"
        );
      }
    }
  );
}

async function init() {
  setupModals();
  setupActions();
  setupAuthListener();

  try {
    const session =
      await getSession();

    if (!session?.user) {
      window.location.replace(
        "index.html"
      );
      return;
    }

    currentUser =
      session.user;

    await loadProfile();
    await loadPlans();
    await loadCurrentBoard();

    showApp();
  } catch (error) {
    console.error(error);

    showDashboardError(
      "Impossible de charger votre espace."
    );
  }
}

document.addEventListener(
  "DOMContentLoaded",
  init
);
