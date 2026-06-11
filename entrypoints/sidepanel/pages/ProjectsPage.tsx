import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectContext, ProjectContextState, ProjectFile } from '../../../core/types';
import { requestGitHubProjectImportPermission } from '../github-permission';
import { useI18n } from '../i18n';

type ImportState = 'idle' | 'running' | 'error' | 'done';

export default function ProjectsPage() {
  const { t } = useI18n();
  const [state, setState] = useState<ProjectContextState | null>(null);
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [manualPath, setManualPath] = useState('notes.md');
  const [manualContent, setManualContent] = useState('');
  const [importState, setImportState] = useState<ImportState>('idle');
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void load();
    const handler = (msg: { type?: string; state?: ProjectContextState }) => {
      if (msg.type === 'PROJECT_CONTEXT_UPDATED') {
        setState(msg.state ?? null);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const activeProject = useMemo(
    () => state?.projects.find((project) => project.id === state.activeProjectId) ?? null,
    [state],
  );
  const activeFiles = useMemo(
    () => state?.files.filter((file) => file.projectId === activeProject?.id) ?? [],
    [activeProject?.id, state],
  );

  async function load() {
    const next = await chrome.runtime.sendMessage({ type: 'GET_PROJECT_CONTEXT_STATE' }) as ProjectContextState;
    setState(next);
  }

  async function createProject() {
    if (!name.trim()) return;
    await chrome.runtime.sendMessage({
      type: 'CREATE_PROJECT_CONTEXT',
      payload: { name, instructions },
    });
    setName('');
    setInstructions('');
    await load();
  }

  async function setActive(projectId: string | null) {
    await chrome.runtime.sendMessage({
      type: 'SET_ACTIVE_PROJECT_CONTEXT',
      payload: { projectId },
    });
    await load();
  }

  async function deleteProject(project: ProjectContext) {
    if (!confirm(t('sidepanel.projectsPage.deleteConfirm', { name: project.name }))) return;
    await chrome.runtime.sendMessage({
      type: 'DELETE_PROJECT_CONTEXT',
      payload: { projectId: project.id },
    });
    await load();
  }

  async function addManualFile() {
    if (!activeProject || !manualPath.trim() || !manualContent.trim()) return;
    await chrome.runtime.sendMessage({
      type: 'ADD_PROJECT_FILES',
      payload: {
        projectId: activeProject.id,
        files: [{ path: manualPath, content: manualContent, sourceKind: 'manual' }],
      },
    });
    setManualContent('');
    await load();
  }

  async function importGithub() {
    if (!activeProject || !githubUrl.trim()) return;
    setImportState('running');
    setMessage('');
    try {
      const granted = await requestGitHubProjectImportPermission();
      if (!granted) {
        setImportState('error');
        setMessage(t('sidepanel.projectsPage.permissionError'));
        return;
      }
      const result = await chrome.runtime.sendMessage({
        type: 'IMPORT_GITHUB_PROJECT_CONTEXT',
        payload: { projectId: activeProject.id, url: githubUrl },
      }) as { files?: ProjectFile[]; warnings?: string[] };
      const warnings = result.warnings?.length ?? 0;
      setImportState('done');
      setMessage(warnings > 0
        ? t('sidepanel.projectsPage.importCompleteWithWarnings', { count: result.files?.length ?? 0, warnings })
        : t('sidepanel.projectsPage.importComplete', { count: result.files?.length ?? 0 }));
      await load();
    } catch (error) {
      setImportState('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function importLocalFiles(files: FileList | null) {
    if (!activeProject || !files?.length) return;
    const inputs = [];
    for (const file of Array.from(files)) {
      if (file.size > 512 * 1024) continue;
      const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      inputs.push({ path, content: await file.text(), sourceKind: 'local_folder' });
    }
    if (inputs.length === 0) return;
    await chrome.runtime.sendMessage({
      type: 'ADD_PROJECT_FILES',
      payload: { projectId: activeProject.id, files: inputs },
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
    await load();
  }

  return (
    <div className="p-4 space-y-4">
      <section className="ds-surface-panel rounded-xl p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--ds-text)' }}>{t('sidepanel.projectsPage.title')}</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--ds-text-tertiary)' }}>
            {t('sidepanel.projectsPage.description')}
          </p>
        </div>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('sidepanel.projectsPage.namePlaceholder')}
          className="w-full px-3 py-2 text-xs rounded-lg border outline-none"
          style={inputStyle}
        />
        <textarea
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder={t('sidepanel.projectsPage.instructionsPlaceholder')}
          className="w-full px-3 py-2 text-xs rounded-lg border outline-none min-h-[72px]"
          style={inputStyle}
        />
        <button
          onClick={createProject}
          disabled={!name.trim()}
          className="ds-btn-primary px-3 py-2 text-xs rounded-lg disabled:opacity-40"
        >
          {t('sidepanel.projectsPage.createProject')}
        </button>
      </section>

      <section className="space-y-2">
        {(state?.projects ?? []).map((project) => (
          <div key={project.id} className="ds-surface-panel rounded-xl p-3 flex items-start gap-3">
            <button
              type="button"
              onClick={() => setActive(project.id)}
              className="mt-1 w-4 h-4 rounded-full border"
              style={{
                background: project.id === state?.activeProjectId ? 'var(--ds-blue)' : 'transparent',
                borderColor: 'var(--ds-border)',
              }}
              aria-label={t('sidepanel.projectsPage.activateProject', { name: project.name })}
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate" style={{ color: 'var(--ds-text)' }}>{project.name}</div>
              <div className="text-[11px]" style={{ color: 'var(--ds-text-tertiary)' }}>
                {t('sidepanel.projectsPage.fileCount', {
                  count: (state?.files ?? []).filter((file) => file.projectId === project.id).length,
                })}
              </div>
            </div>
            <button onClick={() => deleteProject(project)} className="ds-btn-secondary px-2 py-1 text-[11px] rounded-md">
              {t('sidepanel.projectsPage.deleteProject')}
            </button>
          </div>
        ))}
      </section>

      {activeProject && (
        <section className="ds-surface-panel rounded-xl p-4 space-y-3">
          <div className="text-xs font-semibold" style={{ color: 'var(--ds-text)' }}>
            {t('sidepanel.projectsPage.activeProject', { name: activeProject.name })}
          </div>
          <div className="grid grid-cols-1 gap-2">
            <input
              value={githubUrl}
              onChange={(event) => setGithubUrl(event.target.value)}
              placeholder={t('sidepanel.projectsPage.githubPlaceholder')}
              className="px-3 py-2 text-xs rounded-lg border outline-none"
              style={inputStyle}
            />
            <button
              onClick={importGithub}
              disabled={importState === 'running' || !githubUrl.trim()}
              className="ds-btn-secondary px-3 py-2 text-xs rounded-lg disabled:opacity-40"
            >
              {importState === 'running' ? t('sidepanel.projectsPage.importingGithub') : t('sidepanel.projectsPage.importGithub')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              // Chromium supports folder import through this non-standard attribute.
              {...{ webkitdirectory: '' }}
              onChange={(event) => void importLocalFiles(event.target.files)}
              className="text-xs"
              style={{ color: 'var(--ds-text-secondary)' }}
            />
          </div>
          {message && (
            <div className="text-[11px] rounded-lg px-2 py-1.5" style={{ color: 'var(--ds-text-secondary)', background: 'var(--ds-surface)' }}>
              {message}
            </div>
          )}
          <div className="space-y-2">
            <input
              value={manualPath}
              onChange={(event) => setManualPath(event.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border outline-none"
              style={inputStyle}
              placeholder={t('sidepanel.projectsPage.manualPathPlaceholder')}
            />
            <textarea
              value={manualContent}
              onChange={(event) => setManualContent(event.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border outline-none min-h-[90px]"
              style={inputStyle}
              placeholder={t('sidepanel.projectsPage.manualContentPlaceholder')}
            />
            <button
              onClick={addManualFile}
              disabled={!manualPath.trim() || !manualContent.trim()}
              className="ds-btn-secondary px-3 py-2 text-xs rounded-lg disabled:opacity-40"
            >
              {t('sidepanel.projectsPage.addManualFile')}
            </button>
          </div>
          <div className="space-y-1 max-h-52 overflow-y-auto">
            {activeFiles.map((file) => (
              <label key={file.id} className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--ds-text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={(state?.activeFileIds.length ?? 0) === 0 || state?.activeFileIds.includes(file.id)}
                  onChange={(event) => {
                    const current = new Set(state?.activeFileIds.length ? state.activeFileIds : activeFiles.map((item) => item.id));
                    if (event.target.checked) current.add(file.id);
                    else current.delete(file.id);
                    void chrome.runtime.sendMessage({
                      type: 'SET_ACTIVE_PROJECT_FILES',
                      payload: { projectId: activeProject.id, fileIds: [...current] },
                    }).then(load);
                  }}
                />
                <span className="truncate">{file.path}</span>
                <span className="shrink-0">{file.sizeBytes} B</span>
              </label>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const inputStyle = {
  background: 'var(--ds-bg)',
  borderColor: 'var(--ds-border)',
  color: 'var(--ds-text)',
};
