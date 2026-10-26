import { processMapUploadFile, isSupportedMapFormat, isPdfFile, type ProcessedMapFile } from '../map/pdf-loader';
import { uploadMapImage, createProject, deleteProject } from '../api/projects';
import type { Project } from '../api/supabase';

export interface MapModalCallbacks {
  onProjectCreated: (project: Project) => Promise<void>;
  onProjectDeleted: (deletedId: string) => Promise<void>;
  showToast: (msg: string) => void;
}

/**
 * Initializes and binds the Upload Map and Delete Map modals.
 */
export function initMapModals(callbacks: MapModalCallbacks) {
  // 1. Create or ensure modal container in body
  let modalRoot = document.getElementById('map-modals-root');
  if (!modalRoot) {
    modalRoot = document.createElement('div');
    modalRoot.id = 'map-modals-root';
    document.body.appendChild(modalRoot);
  }

  // --- UPLOAD MODAL HTML ---
  const uploadOverlay = document.createElement('div');
  uploadOverlay.className = 'modal-overlay';
  uploadOverlay.id = 'upload-map-modal';
  uploadOverlay.style.display = 'none';

  uploadOverlay.innerHTML = `
    <div class="modal-card map-upload-card" role="dialog" aria-modal="true" aria-labelledby="upload-modal-title">
      <div class="modal-header">
        <div>
          <h2 id="upload-modal-title" class="modal-title">Upload Subdivision Map</h2>
          <p class="modal-subtitle">Upload a CAD plan, blueprint, or map image (PDF, PNG, JPG, WebP).</p>
        </div>
        <button type="button" class="modal-close-btn" id="upload-modal-close" aria-label="Close modal">&times;</button>
      </div>

      <form id="upload-map-form" class="modal-body-form">
        <div class="form-group">
          <label for="upload-map-name" class="form-label">Subdivision / Project Name <span class="required">*</span></label>
          <input
            type="text"
            id="upload-map-name"
            class="form-input"
            placeholder="e.g. Grand Villas Phase 2, Cavite"
            required
            autocomplete="off"
          />
        </div>

        <div class="form-group">
          <label class="form-label">Map File (PDF, PNG, JPG, WebP) <span class="required">*</span></label>
          <div class="file-dropzone" id="map-dropzone" tabindex="0" role="button" aria-label="Drop map file here or click to browse">
            <input
              type="file"
              id="map-file-input"
              class="file-input-hidden"
              accept=".pdf,image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
            />
            <div class="dropzone-content" id="dropzone-empty-state">
              <svg class="dropzone-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <div class="dropzone-text">
                <strong>Click to browse</strong> or drag & drop file here
              </div>
              <div class="dropzone-hint">
                Supported formats: <strong>PDF</strong>, <strong>PNG</strong>, <strong>JPG</strong>, <strong>WEBP</strong>
              </div>
            </div>

            <div class="dropzone-preview" id="dropzone-file-preview" style="display: none;">
              <div class="preview-icon-wrapper" id="preview-badge">📄</div>
              <div class="preview-meta">
                <span class="preview-filename" id="preview-filename">filename.pdf</span>
                <span class="preview-filesize" id="preview-filesize">0 KB</span>
                <span class="preview-badge-pill" id="preview-badge-pill">PDF Document</span>
              </div>
              <button type="button" class="preview-remove-btn" id="preview-remove-btn" title="Choose another file">&times;</button>
            </div>
          </div>
        </div>

        <div id="upload-status-box" class="upload-status-box" style="display: none;">
          <div class="upload-spinner"></div>
          <span id="upload-status-text">Processing map…</span>
        </div>

        <div id="upload-error-box" class="modal-error-box" style="display: none;"></div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="upload-cancel-btn">Cancel</button>
          <button type="submit" class="btn btn-primary" id="upload-submit-btn">
            <span class="btn-text">Upload & Open Map</span>
          </button>
        </div>
      </form>
    </div>
  `;
  modalRoot.appendChild(uploadOverlay);

  // --- DELETE CONFIRMATION MODAL HTML ---
  const deleteOverlay = document.createElement('div');
  deleteOverlay.className = 'modal-overlay';
  deleteOverlay.id = 'delete-map-modal';
  deleteOverlay.style.display = 'none';

  deleteOverlay.innerHTML = `
    <div class="modal-card modal-confirm-card" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
      <div class="modal-header">
        <div>
          <h2 id="delete-modal-title" class="modal-title text-danger">Delete Subdivision Map</h2>
          <p class="modal-subtitle">This action cannot be undone.</p>
        </div>
        <button type="button" class="modal-close-btn" id="delete-modal-close" aria-label="Close modal">&times;</button>
      </div>

      <div class="modal-body">
        <p class="confirm-message">
          Are you sure you want to permanently delete <strong id="delete-map-name-label">[Map Name]</strong>?
        </p>
        <p class="confirm-subtext">
          Deleting this map will remove the map file and all lot statuses, pins, and marks associated with this project.
        </p>
        <div id="delete-error-box" class="modal-error-box" style="display: none;"></div>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="delete-cancel-btn">Cancel</button>
        <button type="button" class="btn btn-danger" id="delete-confirm-btn">
          <span class="btn-text">Delete Map</span>
        </button>
      </div>
    </div>
  `;
  modalRoot.appendChild(deleteOverlay);

  // References
  const uploadNameInput = uploadOverlay.querySelector<HTMLInputElement>('#upload-map-name')!;
  const fileInput = uploadOverlay.querySelector<HTMLInputElement>('#map-file-input')!;
  const dropzone = uploadOverlay.querySelector<HTMLElement>('#map-dropzone')!;
  const emptyState = uploadOverlay.querySelector<HTMLElement>('#dropzone-empty-state')!;
  const filePreview = uploadOverlay.querySelector<HTMLElement>('#dropzone-file-preview')!;
  const previewFilename = uploadOverlay.querySelector<HTMLElement>('#preview-filename')!;
  const previewFilesize = uploadOverlay.querySelector<HTMLElement>('#preview-filesize')!;
  const previewBadge = uploadOverlay.querySelector<HTMLElement>('#preview-badge')!;
  const previewBadgePill = uploadOverlay.querySelector<HTMLElement>('#preview-badge-pill')!;
  const previewRemoveBtn = uploadOverlay.querySelector<HTMLButtonElement>('#preview-remove-btn')!;
  const uploadStatusBox = uploadOverlay.querySelector<HTMLElement>('#upload-status-box')!;
  const uploadStatusText = uploadOverlay.querySelector<HTMLElement>('#upload-status-text')!;
  const uploadErrorBox = uploadOverlay.querySelector<HTMLElement>('#upload-error-box')!;
  const uploadSubmitBtn = uploadOverlay.querySelector<HTMLButtonElement>('#upload-submit-btn')!;
  const uploadCancelBtn = uploadOverlay.querySelector<HTMLButtonElement>('#upload-cancel-btn')!;
  const uploadCloseBtn = uploadOverlay.querySelector<HTMLButtonElement>('#upload-modal-close')!;
  const uploadForm = uploadOverlay.querySelector<HTMLFormElement>('#upload-map-form')!;

  const deleteCloseBtn = deleteOverlay.querySelector<HTMLButtonElement>('#delete-modal-close')!;
  const deleteCancelBtn = deleteOverlay.querySelector<HTMLButtonElement>('#delete-cancel-btn')!;
  const deleteConfirmBtn = deleteOverlay.querySelector<HTMLButtonElement>('#delete-confirm-btn')!;
  const deleteMapNameLabel = deleteOverlay.querySelector<HTMLElement>('#delete-map-name-label')!;
  const deleteErrorBox = deleteOverlay.querySelector<HTMLElement>('#delete-error-box')!;

  let selectedFile: File | null = null;
  let targetDeleteProject: Project | null = null;

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function setSelectedFile(file: File | null): void {
    selectedFile = file;
    if (uploadErrorBox) uploadErrorBox.style.display = 'none';

    if (!file) {
      if (fileInput) fileInput.value = '';
      if (emptyState) emptyState.style.display = 'flex';
      if (filePreview) filePreview.style.display = 'none';
      return;
    }

    if (!isSupportedMapFormat(file)) {
      showUploadError('Unsupported file format. Please upload a PDF, PNG, JPG, or WebP file.');
      setSelectedFile(null);
      return;
    }

    // Auto-fill project name from file name if input is currently blank
    if (!uploadNameInput.value.trim()) {
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      uploadNameInput.value = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    }

    const isPdf = isPdfFile(file);
    previewBadge.textContent = isPdf ? '📑' : '🗺️';
    previewFilename.textContent = file.name;
    previewFilesize.textContent = formatBytes(file.size);
    previewBadgePill.textContent = isPdf ? 'PDF Blueprint' : `${file.type.split('/')[1]?.toUpperCase() || 'Image'}`;
    previewBadgePill.className = `preview-badge-pill ${isPdf ? 'pill-pdf' : 'pill-img'}`;

    if (emptyState) emptyState.style.display = 'none';
    if (filePreview) filePreview.style.display = 'flex';
  }

  function showUploadError(msg: string): void {
    if (uploadErrorBox) {
      uploadErrorBox.textContent = msg;
      uploadErrorBox.style.display = 'block';
    }
  }

  function setUploadLoading(loading: boolean, text = 'Processing map…'): void {
    if (uploadStatusBox) uploadStatusBox.style.display = loading ? 'flex' : 'none';
    if (uploadStatusText) uploadStatusText.textContent = text;
    if (uploadSubmitBtn) {
      uploadSubmitBtn.disabled = loading;
      const btnText = uploadSubmitBtn.querySelector('.btn-text');
      if (btnText) btnText.textContent = loading ? 'Uploading…' : 'Upload & Open Map';
    }
    if (uploadCancelBtn) uploadCancelBtn.disabled = loading;
  }

  function openUploadModal(): void {
    uploadOverlay.style.display = 'flex';
    uploadNameInput.value = '';
    setSelectedFile(null);
    setUploadLoading(false);
    if (uploadErrorBox) uploadErrorBox.style.display = 'none';
    setTimeout(() => uploadNameInput.focus(), 50);
  }

  function closeUploadModal(): void {
    uploadOverlay.style.display = 'none';
    setUploadLoading(false);
  }

  function openDeleteModal(project: Project): void {
    targetDeleteProject = project;
    deleteMapNameLabel.textContent = project.name;
    if (deleteErrorBox) deleteErrorBox.style.display = 'none';
    if (deleteConfirmBtn) deleteConfirmBtn.disabled = false;
    deleteOverlay.style.display = 'flex';
  }

  function closeDeleteModal(): void {
    deleteOverlay.style.display = 'none';
    targetDeleteProject = null;
  }

  // File Dropzone handlers
  dropzone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      setSelectedFile(fileInput.files[0]);
    }
  });

  previewRemoveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setSelectedFile(null);
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dropzone-active');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dropzone-active');
    });
  });

  dropzone.addEventListener('drop', (e: DragEvent) => {
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  });

  // Upload Form Submit
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = uploadNameInput.value.trim();
    if (!name) {
      showUploadError('Please provide a project or subdivision name.');
      uploadNameInput.focus();
      return;
    }

    if (!selectedFile) {
      showUploadError('Please select a PDF or image map file.');
      return;
    }

    try {
      setUploadLoading(true, 'Reading and preparing file…');

      // 1. Convert PDF or load Image
      const processed: ProcessedMapFile = await processMapUploadFile(selectedFile, (msg) => {
        setUploadLoading(true, msg);
      });

      // 2. Upload file to Supabase Storage (with dataUrl fallback)
      setUploadLoading(true, 'Uploading map image…');
      const mapUrl = await uploadMapImage(processed.blob, selectedFile.name, processed.dataUrl);

      // 3. Create project record in Database
      setUploadLoading(true, 'Registering project…');
      const { data: newProj, error } = await createProject({
        name,
        map_url: mapUrl,
        legend_x: 0.5,
        legend_y: 0.5,
      });

      if (error || !newProj) {
        throw new Error(error?.message || 'Failed to save project record.');
      }

      callbacks.showToast(`Map "${newProj.name}" uploaded successfully!`);
      closeUploadModal();
      await callbacks.onProjectCreated(newProj);
    } catch (err) {
      console.error('Map upload error:', err);
      showUploadError(err instanceof Error ? err.message : 'Failed to upload map. Please try again.');
      setUploadLoading(false);
    }
  });

  // Delete Confirm Button
  deleteConfirmBtn.addEventListener('click', async () => {
    if (!targetDeleteProject) return;

    const projectId = targetDeleteProject.id;
    const projectName = targetDeleteProject.name;

    try {
      deleteConfirmBtn.disabled = true;
      const btnText = deleteConfirmBtn.querySelector('.btn-text');
      if (btnText) btnText.textContent = 'Deleting…';

      const { error } = await deleteProject(projectId);
      if (error) {
        throw new Error(error.message);
      }

      callbacks.showToast(`Map "${projectName}" deleted successfully.`);
      closeDeleteModal();
      await callbacks.onProjectDeleted(projectId);
    } catch (err) {
      console.error('Delete project error:', err);
      if (deleteErrorBox) {
        deleteErrorBox.textContent = err instanceof Error ? err.message : 'Failed to delete project.';
        deleteErrorBox.style.display = 'block';
      }
      deleteConfirmBtn.disabled = false;
      const btnText = deleteConfirmBtn.querySelector('.btn-text');
      if (btnText) btnText.textContent = 'Delete Map';
    }
  });

  // Modal Close & Escape
  uploadCloseBtn.addEventListener('click', closeUploadModal);
  uploadCancelBtn.addEventListener('click', closeUploadModal);
  deleteCloseBtn.addEventListener('click', closeDeleteModal);
  deleteCancelBtn.addEventListener('click', closeDeleteModal);

  uploadOverlay.addEventListener('click', (e) => {
    if (e.target === uploadOverlay) closeUploadModal();
  });
  deleteOverlay.addEventListener('click', (e) => {
    if (e.target === deleteOverlay) closeDeleteModal();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (uploadOverlay.style.display === 'flex') closeUploadModal();
      if (deleteOverlay.style.display === 'flex') closeDeleteModal();
    }
  });

  return {
    openUploadModal,
    openDeleteModal,
  };
}
