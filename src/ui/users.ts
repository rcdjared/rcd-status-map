import {
  fetchUsers,
  setUserRole,
  fetchRoleChanges,
  createUserWithRole,
  type UserProfile,
  type RoleChangeLog,
} from '../api/users';
import { showToast } from './toast';

export interface UsersUIElements {
  container: HTMLElement;
  toastElement: HTMLElement;
  currentUserId: string;
}

export function initUsersManagement(elements: UsersUIElements): {
  load: () => Promise<void>;
  close: () => void;
} {
  const { container, toastElement, currentUserId } = elements;
  let allUsers: UserProfile[] = [];
  let currentFilter = 'all';
  let searchQuery = '';

  function renderView(): void {
    container.innerHTML = `
      <div class="users-panel">
        <div class="users-header">
          <div class="users-title-group">
            <h2>User Management</h2>
            <p class="users-subtitle">Review active accounts, change permission roles, or invite team members</p>
          </div>
          <div class="users-header-actions">
            <button id="add-user-btn" class="btn btn-primary">
              <span class="icon">+</span> Add / Invite User
            </button>
            <button id="users-close-btn" class="btn btn-secondary">Back to Map</button>
          </div>
        </div>

        <div class="users-toolbar">
          <div class="users-search-box">
            <input 
              type="text" 
              id="users-search-input" 
              placeholder="Search by email or name..." 
              value="${searchQuery}" 
            />
          </div>
          <div class="users-filter-pills" id="users-filter-pills">
            <button class="pill ${currentFilter === 'all' ? 'on' : ''}" data-filter="all">All</button>
            <button class="pill ${currentFilter === 'admin' ? 'on' : ''}" data-filter="admin">Admins</button>
            <button class="pill ${currentFilter === 'editor' ? 'on' : ''}" data-filter="editor">Editors</button>
            <button class="pill ${currentFilter === 'viewer' ? 'on' : ''}" data-filter="viewer">Viewers</button>
            <button class="pill ${currentFilter === 'disabled' ? 'on' : ''}" data-filter="disabled">Disabled</button>
          </div>
        </div>

        <div class="users-stats-bar" id="users-stats-bar"></div>

        <div class="users-table-wrapper">
          <table class="users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="users-tbody">
              <tr>
                <td colspan="4" class="users-loading">Loading users...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Add User Modal -->
      <div id="add-user-modal" class="modal-overlay" style="display:none;" role="dialog" aria-modal="true">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Add New Team Member</h3>
            <p class="modal-sub">Create a new user account with a predefined role</p>
          </div>
          <form id="add-user-form" class="auth-form">
            <div class="form-group">
              <label for="new-user-email">Email Address</label>
              <input type="email" id="new-user-email" required placeholder="colleague@rcd.com" />
            </div>
            <div class="form-group">
              <label for="new-user-password">Initial Password</label>
              <input type="password" id="new-user-password" required minlength="6" placeholder="At least 6 characters" />
            </div>
            <div class="form-group">
              <label for="new-user-role">Role</label>
              <select id="new-user-role" class="form-select">
                <option value="viewer">Viewer (View-only + Live updates)</option>
                <option value="editor">Editor (Can paint & edit lots)</option>
                <option value="admin">Admin (Full access + User management)</option>
              </select>
            </div>
            <div id="add-user-error" class="auth-error" style="display:none;"></div>
            <div class="modal-actions">
              <button type="button" id="add-user-cancel" class="btn btn-secondary">Cancel</button>
              <button type="submit" id="add-user-submit" class="btn btn-primary">Create User</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Role History Modal -->
      <div id="role-history-modal" class="modal-overlay" style="display:none;" role="dialog" aria-modal="true">
        <div class="modal-content modal-content-lg">
          <div class="modal-header">
            <h3 id="role-history-title">Role Change History</h3>
            <p class="modal-sub">Audit trail of role changes made by administrators</p>
          </div>
          <div id="role-history-body" class="role-history-body">
            <p class="users-loading">Loading history...</p>
          </div>
          <div class="modal-actions">
            <button type="button" id="role-history-close" class="btn btn-secondary">Close</button>
          </div>
        </div>
      </div>

      <!-- Confirmation Dialog -->
      <div id="confirm-modal" class="modal-overlay" style="display:none;" role="dialog" aria-modal="true">
        <div class="modal-content">
          <div class="modal-header">
            <h3 id="confirm-title">Confirm Role Change</h3>
            <p id="confirm-message" class="modal-sub"></p>
          </div>
          <div class="modal-actions">
            <button type="button" id="confirm-cancel" class="btn btn-secondary">Cancel</button>
            <button type="button" id="confirm-proceed" class="btn btn-danger">Confirm Change</button>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents(): void {
    const searchInput = container.querySelector<HTMLInputElement>('#users-search-input');
    searchInput?.addEventListener('input', (e) => {
      searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
      renderTableRows();
    });

    const pills = container.querySelectorAll<HTMLElement>('.pill[data-filter]');
    pills.forEach((pill) => {
      pill.addEventListener('click', () => {
        pills.forEach((p) => p.classList.remove('on'));
        pill.classList.add('on');
        currentFilter = pill.dataset.filter || 'all';
        renderTableRows();
      });
    });

    const closeBtn = container.querySelector<HTMLElement>('#users-close-btn');
    closeBtn?.addEventListener('click', () => {
      close();
    });

    // Add User Modal
    const addUserBtn = container.querySelector<HTMLElement>('#add-user-btn');
    const addUserModal = container.querySelector<HTMLElement>('#add-user-modal');
    const addUserCancel = container.querySelector<HTMLElement>('#add-user-cancel');
    const addUserForm = container.querySelector<HTMLFormElement>('#add-user-form');
    const addUserError = container.querySelector<HTMLElement>('#add-user-error');

    addUserBtn?.addEventListener('click', () => {
      if (addUserModal) addUserModal.style.display = 'flex';
      if (addUserError) addUserError.style.display = 'none';
      addUserForm?.reset();
    });

    addUserCancel?.addEventListener('click', () => {
      if (addUserModal) addUserModal.style.display = 'none';
    });

    addUserForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (container.querySelector<HTMLInputElement>('#new-user-email')?.value || '').trim();
      const password = (container.querySelector<HTMLInputElement>('#new-user-password')?.value || '').trim();
      const role = (container.querySelector<HTMLSelectElement>('#new-user-role')?.value || 'viewer') as
        | 'admin'
        | 'editor'
        | 'viewer'
        | 'disabled';

      if (!email || !password) return;

      const submitBtn = container.querySelector<HTMLButtonElement>('#add-user-submit');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
      }

      const { data, error } = await createUserWithRole(email, password, role);

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create User';
      }

      if (error) {
        if (addUserError) {
          addUserError.textContent = error.message;
          addUserError.style.display = 'block';
        }
        return;
      }

      if (addUserModal) addUserModal.style.display = 'none';
      showToast(toastElement, `User ${data?.email || email} created as ${role}!`);
      await loadUsers();
    });

    // History Modal Close
    const historyModal = container.querySelector<HTMLElement>('#role-history-modal');
    const historyClose = container.querySelector<HTMLElement>('#role-history-close');
    historyClose?.addEventListener('click', () => {
      if (historyModal) historyModal.style.display = 'none';
    });
  }

  function renderStats(): void {
    const statsBar = container.querySelector<HTMLElement>('#users-stats-bar');
    if (!statsBar) return;

    const total = allUsers.length;
    const admins = allUsers.filter((u) => u.role === 'admin').length;
    const editors = allUsers.filter((u) => u.role === 'editor').length;
    const viewers = allUsers.filter((u) => u.role === 'viewer').length;
    const disabled = allUsers.filter((u) => u.role === 'disabled').length;

    statsBar.innerHTML = `
      <div class="stat-card">
        <span class="stat-num">${total}</span>
        <span class="stat-label">Total Users</span>
      </div>
      <div class="stat-card stat-admin">
        <span class="stat-num">${admins}</span>
        <span class="stat-label">Admins</span>
      </div>
      <div class="stat-card stat-editor">
        <span class="stat-num">${editors}</span>
        <span class="stat-label">Editors</span>
      </div>
      <div class="stat-card stat-viewer">
        <span class="stat-num">${viewers}</span>
        <span class="stat-label">Viewers</span>
      </div>
      <div class="stat-card stat-disabled">
        <span class="stat-num">${disabled}</span>
        <span class="stat-label">Disabled</span>
      </div>
    `;
  }

  function renderTableRows(): void {
    const tbody = container.querySelector<HTMLElement>('#users-tbody');
    if (!tbody) return;

    const filtered = allUsers.filter((user) => {
      const matchesFilter = currentFilter === 'all' || user.role === currentFilter;
      const email = (user.email || '').toLowerCase();
      const name = (user.display_name || '').toLowerCase();
      const matchesSearch = !searchQuery || email.includes(searchQuery) || name.includes(searchQuery);
      return matchesFilter && matchesSearch;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="users-empty">No users found matching current filter or search.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered
      .map((u) => {
        const isSelf = u.id === currentUserId;
        const joinedDate = u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A';
        const displayName = u.display_name || u.email?.split('@')[0] || 'User';
        const email = u.email || 'No email registered';

        return `
          <tr data-user-id="${u.id}">
            <td class="user-info-cell">
              <div class="user-avatar-badge">${displayName.charAt(0).toUpperCase()}</div>
              <div class="user-text">
                <span class="user-name">${displayName} ${isSelf ? '<span class="you-tag">(You)</span>' : ''}</span>
                <span class="user-email">${email}</span>
              </div>
            </td>
            <td>
              <span class="role-pill role-pill-${u.role}">
                ${u.role.toUpperCase()}
              </span>
            </td>
            <td class="user-date">${joinedDate}</td>
            <td class="user-actions-cell">
              <select 
                class="role-select" 
                data-user-id="${u.id}" 
                data-current-role="${u.role}"
                ${isSelf ? 'disabled title="You cannot change your own role"' : ''}
              >
                <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                <option value="editor" ${u.role === 'editor' ? 'selected' : ''}>Editor</option>
                <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                <option value="disabled" ${u.role === 'disabled' ? 'selected' : ''}>Disabled</option>
              </select>
              <button class="btn btn-sm btn-outline history-btn" data-user-id="${u.id}" data-user-email="${email}">
                History
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    // Attach row select & history events
    attachRowHandlers();
  }

  function attachRowHandlers(): void {
    const selects = container.querySelectorAll<HTMLSelectElement>('.role-select');
    selects.forEach((select) => {
      select.addEventListener('change', async (e) => {
        const target = e.target as HTMLSelectElement;
        const userId = target.dataset.userId;
        const currentRole = target.dataset.currentRole as 'admin' | 'editor' | 'viewer' | 'disabled';
        const newRole = target.value as 'admin' | 'editor' | 'viewer' | 'disabled';

        if (!userId || currentRole === newRole) return;

        const targetUser = allUsers.find((u) => u.id === userId);
        const email = targetUser?.email || 'this user';

        // Prompt confirmation
        promptConfirm(
          'Confirm Role Change',
          `Change <strong>${email}</strong> from <strong>${currentRole}</strong> to <strong>${newRole}</strong>?`,
          async () => {
            target.disabled = true;
            const { error } = await setUserRole(userId, newRole);
            target.disabled = false;

            if (error) {
              showToast(toastElement, `Failed to update role: ${error.message}`);
              target.value = currentRole; // revert selection
              return;
            }

            showToast(toastElement, `Updated ${email}'s role to ${newRole}`);
            if (targetUser) targetUser.role = newRole;
            renderStats();
            renderTableRows();
          },
          () => {
            target.value = currentRole; // reverted by user cancel
          }
        );
      });
    });

    const historyBtns = container.querySelectorAll<HTMLElement>('.history-btn');
    historyBtns.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const userId = btn.dataset.userId;
        const userEmail = btn.dataset.userEmail || 'User';
        if (!userId) return;
        await showHistoryModal(userId, userEmail);
      });
    });
  }

  function promptConfirm(
    title: string,
    messageHtml: string,
    onConfirm: () => void,
    onCancel?: () => void
  ): void {
    const confirmModal = container.querySelector<HTMLElement>('#confirm-modal');
    const confirmTitle = container.querySelector<HTMLElement>('#confirm-title');
    const confirmMessage = container.querySelector<HTMLElement>('#confirm-message');
    const confirmProceed = container.querySelector<HTMLButtonElement>('#confirm-proceed');
    const confirmCancel = container.querySelector<HTMLButtonElement>('#confirm-cancel');

    if (!confirmModal || !confirmTitle || !confirmMessage || !confirmProceed || !confirmCancel) return;

    confirmTitle.textContent = title;
    confirmMessage.innerHTML = messageHtml;
    confirmModal.style.display = 'flex';

    const handleConfirm = () => {
      cleanup();
      confirmModal.style.display = 'none';
      onConfirm();
    };

    const handleCancel = () => {
      cleanup();
      confirmModal.style.display = 'none';
      if (onCancel) onCancel();
    };

    const cleanup = () => {
      confirmProceed.removeEventListener('click', handleConfirm);
      confirmCancel.removeEventListener('click', handleCancel);
    };

    confirmProceed.addEventListener('click', handleConfirm);
    confirmCancel.addEventListener('click', handleCancel);
  }

  async function showHistoryModal(userId: string, userEmail: string): Promise<void> {
    const historyModal = container.querySelector<HTMLElement>('#role-history-modal');
    const historyTitle = container.querySelector<HTMLElement>('#role-history-title');
    const historyBody = container.querySelector<HTMLElement>('#role-history-body');

    if (!historyModal || !historyTitle || !historyBody) return;

    historyTitle.textContent = `Role History — ${userEmail}`;
    historyBody.innerHTML = '<p class="users-loading">Fetching audit trail...</p>';
    historyModal.style.display = 'flex';

    const { data, error } = await fetchRoleChanges(userId);
    if (error) {
      historyBody.innerHTML = `<p class="auth-error">Error loading history: ${error.message}</p>`;
      return;
    }

    if (!data || data.length === 0) {
      historyBody.innerHTML = '<p class="users-empty">No role changes recorded yet for this user.</p>';
      return;
    }

    historyBody.innerHTML = `
      <table class="history-table">
        <thead>
          <tr>
            <th>Date & Time</th>
            <th>Old Role</th>
            <th>New Role</th>
            <th>Changed By ID</th>
          </tr>
        </thead>
        <tbody>
          ${data
            .map(
              (log: RoleChangeLog) => `
            <tr>
              <td>${new Date(log.changed_at).toLocaleString()}</td>
              <td><span class="role-pill role-pill-${log.old_role}">${log.old_role}</span></td>
              <td><span class="role-pill role-pill-${log.new_role}">${log.new_role}</span></td>
              <td class="history-changer">${log.changed_by.slice(0, 8)}...</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
  }

  async function loadUsers(): Promise<void> {
    const { data, error } = await fetchUsers();
    if (error) {
      showToast(toastElement, `Could not load users: ${error.message}`);
      const tbody = container.querySelector<HTMLElement>('#users-tbody');
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="4" class="auth-error">Error loading users: ${error.message}</td></tr>`;
      }
      return;
    }

    allUsers = data || [];
    renderStats();
    renderTableRows();
  }

  function close(): void {
    container.style.display = 'none';
    const stage = document.querySelector<HTMLElement>('#stage');
    if (stage) stage.style.display = 'block';
  }

  return {
    load: async () => {
      renderView();
      container.style.display = 'block';
      const stage = document.querySelector<HTMLElement>('#stage');
      if (stage) stage.style.display = 'none';
      await loadUsers();
    },
    close,
  };
}
