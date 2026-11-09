/**
 * Client half of @local/dsh-git-gui.
 *
 * Registers a "Git" page tab type in the right sidebar (guide card included)
 * and renders an IDEA-commit-style panel: change list with per-file staging,
 * unified diff view, commit message box, and recent history.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-git-gui',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useMemo, useCallback } = React;

    const DICTS = {
      en: {
        tabTitle: 'Git',
        panelLabel: 'Git changes',
        guideDesc: 'Review changes, diff files, and commit',
        refresh: 'Refresh',
        changes: 'Changes',
        history: 'History',
        noChanges: 'No changes',
        notRepo: 'Not a git repository',
        staged: 'Staged diff',
        unstaged: 'Unstaged diff',
        commitPlaceholder: 'Commit message…',
        commit: 'Commit',
        amend: 'Amend',
        selectFile: 'Select a file to view its diff',
        loading: 'Loading…',
        error: 'Error',
        selectedCount: 'selected',
        stage: 'Stage',
        unstage: 'Unstage',
        ahead: 'ahead',
        behind: 'behind',
        noHistory: 'No commits yet',
        committing: 'Committing…',
        nothingStaged: 'Select files and enter a message',
      },
      zh: {
        tabTitle: 'Git',
        panelLabel: 'Git 修改',
        guideDesc: '查看修改、对比 diff 并提交',
        refresh: '刷新',
        changes: '修改',
        history: '历史',
        noChanges: '没有修改',
        notRepo: '当前目录不是 Git 仓库',
        staged: '已暂存',
        unstaged: '未暂存',
        commitPlaceholder: '提交信息…',
        commit: '提交',
        amend: '追加',
        selectFile: '选择文件查看 diff',
        loading: '加载中…',
        error: '错误',
        selectedCount: '已选',
        stage: '暂存',
        unstage: '取消暂存',
        ahead: '领先',
        behind: '落后',
        noHistory: '还没有提交',
        committing: '提交中…',
        nothingStaged: '请选择文件并填写提交信息',
      },
    };

    const CSS = `
.dshg-panel{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px;line-height:1.45}
.dshg-toolbar{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
.dshg-branch{font-weight:600;color:var(--dsw-alias-brand-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshg-tracking{color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dshg-btn{font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:2px 8px;cursor:pointer;white-space:nowrap}
.dshg-btn:hover{background:var(--dsw-alias-bg-layer-2)}
.dshg-btn:disabled{opacity:.5;cursor:default}
.dshg-btn-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff}
.dshg-btn-primary:hover{background:var(--dsw-alias-brand-primary);filter:brightness(1.1)}
.dshg-btn-primary:disabled{opacity:.5;filter:none}
.dshg-tabs{display:flex;gap:2px;padding:4px 8px 0;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
.dshg-tab{font:inherit;padding:3px 10px;border:none;background:none;color:var(--dsw-alias-label-secondary);cursor:pointer;border-bottom:2px solid transparent}
.dshg-tab-active{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:600}
.dshg-body{flex:1;display:flex;flex-direction:column;min-height:0}
.dshg-list{flex:1 1 42%;overflow:auto;min-height:60px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dshg-row{display:flex;align-items:center;gap:6px;padding:3px 8px;cursor:pointer;white-space:nowrap}
.dshg-row:hover{background:var(--dsw-alias-bg-layer-1)}
.dshg-row-active{background:var(--dsw-alias-bg-layer-2)}
.dshg-row input[type=checkbox]{flex:none;margin:0}
.dshg-badge{flex:none;display:inline-flex;justify-content:center;width:14px;font-weight:700;font-size:10px}
.dshg-badge-M{color:var(--dsw-alias-brand-primary)}
.dshg-badge-A{color:var(--dsw-alias-state-success-primary)}
.dshg-badge-D{color:var(--dsw-alias-state-error-primary)}
.dshg-badge-R{color:var(--dsw-alias-brand-primary)}
.dshg-badge-U{color:var(--dsw-alias-state-warn-primary)}
.dshg-badge-Q{color:var(--dsw-alias-label-secondary)}
.dshg-path{overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-primary)}
.dshg-orig{color:var(--dsw-alias-label-secondary)}
.dshg-diff{flex:1 1 58%;display:flex;flex-direction:column;min-height:0}
.dshg-diff-head{display:flex;gap:8px;align-items:center;padding:4px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;min-width:0}
.dshg-diff-toggle{font:inherit;border:none;background:none;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:2px 4px;border-bottom:2px solid transparent}
.dshg-diff-toggle-active{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary)}
.dshg-diff-path{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.dshg-diff-view{flex:1;overflow:auto;margin:0;padding:4px 0;font-family:var(--dsw-mono-font,Consolas,monospace);font-size:11px;white-space:pre;background:var(--dsw-alias-bg-base)}
.dshg-dln{display:block;padding:0 8px}
.dshg-dh{color:var(--dsw-alias-label-secondary)}
.dshg-dm{color:var(--dsw-alias-brand-primary);font-weight:600}
.dshg-da{color:var(--dsw-alias-state-success-primary)}
.dshg-dd{color:var(--dsw-alias-state-error-primary)}
.dshg-commit{flex:none;border-top:1px solid var(--dsw-alias-border-l1);padding:6px 8px;display:flex;flex-direction:column;gap:5px}
.dshg-msg{font:inherit;width:100%;box-sizing:border-box;resize:vertical;min-height:44px;max-height:120px;padding:4px 6px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:6px}
.dshg-commit-row{display:flex;align-items:center;gap:6px}
.dshg-commit-row label{display:flex;align-items:center;gap:3px;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dshg-note{color:var(--dsw-alias-label-secondary)}
.dshg-error{color:var(--dsw-alias-state-error-primary);white-space:pre-wrap}
.dshg-rootline{padding:2px 8px;font-size:11px;border-bottom:1px solid var(--dsw-alias-border-l1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshg-muted{padding:10px 8px;color:var(--dsw-alias-label-secondary)}
.dshg-log-row{padding:4px 8px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dshg-log-subject{color:var(--dsw-alias-label-primary)}
.dshg-log-meta{color:var(--dsw-alias-label-secondary);font-size:11px}
.dshg-selinfo{margin-left:auto;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dshg-stylehost{display:none}
`;

    async function api(payload) {
      const res = await fetch('/dsh-git-gui/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }

    const rawReport = (stage, detail) => {
      try {
        fetch('/dsh-git-gui/api', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'client-report',
            payload: { stage, detail: String(detail ?? '') },
          }),
        }).catch(() => {});
      } catch {
        /* diagnostics only */
      }
    };
    rawReport('module-load', typeof window !== 'undefined' ? location.pathname : 'no-window');

    function badgeClass(entry) {
      const letter =
        entry.y && entry.y !== ' ' ? entry.y : entry.x && entry.x !== ' ' ? entry.x : '?';
      if (letter === 'A') return 'dshg-badge dshg-badge-A';
      if (letter === 'D') return 'dshg-badge dshg-badge-D';
      if (letter === 'R' || letter === 'C') return 'dshg-badge dshg-badge-R';
      if (letter === 'U') return 'dshg-badge dshg-badge-U';
      if (letter === 'M') return 'dshg-badge dshg-badge-M';
      return 'dshg-badge dshg-badge-Q';
    }

    function badgeLetter(entry) {
      if (entry.x === '?') return 'U';
      if (entry.x === 'U') return 'C';
      const letter =
        entry.y && entry.y !== ' ' ? entry.y : entry.x && entry.x !== ' ' ? entry.x : 'M';
      return letter;
    }

    function DiffView({ diff }) {
      const lines = useMemo(() => (diff ? diff.split('\n') : []), [diff]);
      return h(
        'pre',
        { className: 'dshg-diff-view' },
        lines.map((line, index) => {
          let cls = 'dshg-dln';
          if (line.startsWith('@@')) cls += ' dshg-dm';
          else if (line.startsWith('+')) cls += ' dshg-da';
          else if (line.startsWith('-')) cls += ' dshg-dd';
          else if (line.startsWith('diff ') || line.startsWith('index ')) cls += ' dshg-dh';
          return h('span', { key: index, className: cls }, line + '\n');
        }),
      );
    }

    function GitPanel({ ctx, t, getSessionId }) {
      const [view, setView] = useState('changes');
      const [status, setStatus] = useState(null); // {ok, branch, files, ...}
      const [commits, setCommits] = useState([]);
      const [selected, setSelected] = useState(null); // file path
      const [diff, setDiff] = useState(null); // {staged, unstaged}
      const [diffMode, setDiffMode] = useState('unstaged');
      const [checked, setChecked] = useState(() => new Set());
      const [message, setMessage] = useState('');
      const [amend, setAmend] = useState(false);
      const [error, setError] = useState(null);
      const [busy, setBusy] = useState(false);
      const [committing, setCommitting] = useState(false);

      const sessionId = useCallback(() => {
        try {
          return getSessionId ? getSessionId() : undefined;
        } catch {
          return undefined;
        }
      }, [getSessionId]);

      const refresh = useCallback(
        async (keepSelection) => {
          setBusy(true);
          setError(null);
          try {
            const result = await api({ action: 'status', sessionId: sessionId() });
            setStatus(result);
            if (!result.ok) {
              setSelected(null);
              setDiff(null);
            } else if (!keepSelection) {
              setSelected(null);
              setDiff(null);
            }
          } catch (e) {
            setError(String((e && e.message) || e));
          } finally {
            setBusy(false);
          }
        },
        [sessionId],
      );

      const loadLog = useCallback(async () => {
        try {
          const result = await api({ action: 'log', sessionId: sessionId() });
          if (result.ok) setCommits(result.commits || []);
        } catch {
          /* history is best-effort */
        }
      }, [sessionId]);

      useEffect(() => {
        refresh(false);
      }, [refresh]);

      useEffect(() => {
        if (view === 'history') loadLog();
      }, [view, loadLog]);

      const selectFile = useCallback(
        async (path) => {
          setSelected(path);
          setDiff(null);
          setError(null);
          try {
            const result = await api({ action: 'diff', sessionId: sessionId(), path });
            if (result.ok) {
              setDiff({ staged: result.staged, unstaged: result.unstaged });
              setDiffMode(result.unstaged ? 'unstaged' : 'staged');
            } else {
              setError(result.error);
            }
          } catch (e) {
            setError(String((e && e.message) || e));
          }
        },
        [sessionId],
      );

      const toggleCheck = useCallback(
        (path) => {
          setChecked((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
          });
        },
        [],
      );

      const stagePaths = useCallback(
        async (paths, unstage) => {
          if (paths.length === 0) return;
          setBusy(true);
          setError(null);
          try {
            const result = await api({
              action: unstage ? 'unstage' : 'stage',
              sessionId: sessionId(),
              paths,
            });
            if (!result.ok) setError(result.error);
            await refresh(true);
            if (selected) {
              const again = await api({ action: 'diff', sessionId: sessionId(), path: selected });
              if (again.ok) {
                setDiff({ staged: again.staged, unstaged: again.unstaged });
                setDiffMode(again.unstaged ? 'unstaged' : 'staged');
              }
            }
          } catch (e) {
            setError(String((e && e.message) || e));
          } finally {
            setBusy(false);
          }
        },
        [sessionId, refresh, selected],
      );

      const commit = useCallback(async () => {
        setCommitting(true);
        setError(null);
        try {
          const result = await api({
            action: 'commit',
            sessionId: sessionId(),
            paths: [...checked],
            message,
            amend,
          });
          if (!result.ok) {
            setError(result.error);
          } else {
            setMessage('');
            setAmend(false);
            setChecked(new Set());
            await refresh(false);
          }
        } catch (e) {
          setError(String((e && e.message) || e));
        } finally {
          setCommitting(false);
        }
      }, [sessionId, refresh, checked, message, amend]);

      const files = status && status.ok ? status.files || [] : [];
      const activeDiff = diff ? (diffMode === 'staged' ? diff.staged : diff.unstaged) : '';
      const hasStagedDiff = Boolean(diff && diff.staged);
      const hasUnstagedDiff = Boolean(diff && diff.unstaged);
      const canCommit = !committing && message.trim().length > 0 && (checked.size > 0 || hasStagedDiff);

      return h(
        'div',
        { className: 'dshg-panel' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'dshg-toolbar' },
          h('span', { className: 'dshg-branch', title: status && status.ok ? status.root || '' : '' },
            status && status.ok ? status.branch || 'Git' : 'Git'),
          status && status.ok && status.upstream
            ? h(
                'span',
                { className: 'dshg-tracking' },
                `${status.ahead ? `${t('ahead')} ${status.ahead}` : ''}${
                  status.ahead && status.behind ? ' / ' : ''
                }${status.behind ? `${t('behind')} ${status.behind}` : ''}`,
              )
            : null,
          h(
            'button',
            { className: 'dshg-btn', onClick: () => refresh(true), disabled: busy, title: t('refresh') },
            busy ? t('loading') : t('refresh'),
          ),
        ),
        h(
          'div',
          { className: 'dshg-tabs' },
          h(
            'button',
            {
              className: view === 'changes' ? 'dshg-tab dshg-tab-active' : 'dshg-tab',
              onClick: () => setView('changes'),
            },
            t('changes'),
            files.length > 0 ? ` (${files.length})` : '',
          ),
          h(
            'button',
            {
              className: view === 'history' ? 'dshg-tab dshg-tab-active' : 'dshg-tab',
              onClick: () => setView('history'),
            },
            t('history'),
          ),
        ),
        status && status.ok && status.root
          ? h('div', { className: 'dshg-muted dshg-rootline', title: status.root }, status.root)
          : null,
        status && !status.ok
          ? h('div', { className: 'dshg-muted' }, status.notRepo ? `${t('notRepo')}: ${status.root || ''}` : `${t('error')}: ${status.error}`)
          : null,
        error ? h('div', { className: 'dshg-muted dshg-error' }, error) : null,
        view === 'changes'
          ? h(
              'div',
              { className: 'dshg-body' },
              h(
                'div',
                { className: 'dshg-list' },
                files.length === 0 && status && status.ok
                  ? h('div', { className: 'dshg-muted' }, t('noChanges'))
                  : null,
                files.map((entry, index) =>
                  h(
                    'div',
                    {
                      key: `${entry.path}:${index}`,
                      className: selected === entry.path ? 'dshg-row dshg-row-active' : 'dshg-row',
                      onClick: () => selectFile(entry.path),
                    },
                    h('input', {
                      type: 'checkbox',
                      checked: checked.has(entry.path),
                      onClick: (e) => e.stopPropagation(),
                      onChange: () => toggleCheck(entry.path),
                    }),
                    h('span', { className: badgeClass(entry) }, badgeLetter(entry)),
                    h(
                      'span',
                      { className: 'dshg-path', title: entry.orig ? `${entry.orig} → ${entry.path}` : entry.path },
                      entry.path,
                      entry.orig ? h('span', { className: 'dshg-orig' }, ` ← ${entry.orig}`) : null,
                    ),
                    h(
                      'span',
                      { className: 'dshg-selinfo' },
                      h(
                        'button',
                        {
                          className: 'dshg-btn',
                          title: entry.x === '?' || entry.x === 'A' ? '' : t('stage'),
                          onClick: (e) => {
                            e.stopPropagation();
                            stagePaths([entry.path], false);
                          },
                        },
                        '+',
                      ),
                      h(
                        'button',
                        {
                          className: 'dshg-btn',
                          title: t('unstage'),
                          onClick: (e) => {
                            e.stopPropagation();
                            stagePaths([entry.path], true);
                          },
                        },
                        '−',
                      ),
                    ),
                  ),
                ),
              ),
              h(
                'div',
                { className: 'dshg-diff' },
                selected
                  ? h(
                      'div',
                      { className: 'dshg-diff-head' },
                      h(
                        'button',
                        {
                          className: hasUnstagedDiff
                            ? diffMode === 'unstaged'
                              ? 'dshg-diff-toggle dshg-diff-toggle-active'
                              : 'dshg-diff-toggle'
                            : 'dshg-diff-toggle',
                          style: hasUnstagedDiff ? undefined : { visibility: 'hidden' },
                          onClick: () => setDiffMode('unstaged'),
                        },
                        t('unstaged'),
                      ),
                      h(
                        'button',
                        {
                          className: hasStagedDiff
                            ? diffMode === 'staged'
                              ? 'dshg-diff-toggle dshg-diff-toggle-active'
                              : 'dshg-diff-toggle'
                            : 'dshg-diff-toggle',
                          style: hasStagedDiff ? undefined : { visibility: 'hidden' },
                          onClick: () => setDiffMode('staged'),
                        },
                        t('staged'),
                      ),
                      h('span', { className: 'dshg-diff-path', title: selected }, selected),
                    )
                  : null,
                diff === null && selected
                  ? h('div', { className: 'dshg-muted' }, t('loading'))
                  : selected && !activeDiff
                    ? h('div', { className: 'dshg-muted' }, t('noChanges'))
                    : h(DiffView, { diff: activeDiff }),
              ),
              h(
                'div',
                { className: 'dshg-commit' },
                h('textarea', {
                  className: 'dshg-msg',
                  placeholder: t('commitPlaceholder'),
                  value: message,
                  onChange: (e) => setMessage(e.target.value),
                }),
                h(
                  'div',
                  { className: 'dshg-commit-row' },
                  h(
                    'button',
                    { className: 'dshg-btn dshg-btn-primary', onClick: commit, disabled: !canCommit },
                    committing ? t('committing') : t('commit'),
                  ),
                  h(
                    'label',
                    null,
                    h('input', { type: 'checkbox', checked: amend, onChange: (e) => setAmend(e.target.checked) }),
                    t('amend'),
                  ),
                  checked.size > 0
                    ? h('span', { className: 'dshg-note' }, `${t('selectedCount')} ${checked.size}`)
                    : h('span', { className: 'dshg-note' }, t('nothingStaged')),
                ),
              ),
            )
          : h(
              'div',
              { className: 'dshg-list' },
              commits.length === 0
                ? h('div', { className: 'dshg-muted' }, t('noHistory'))
                : commits.map((c) =>
                    h(
                      'div',
                      { key: c.hash, className: 'dshg-log-row' },
                      h('div', { className: 'dshg-log-subject' }, c.subject),
                      h(
                        'div',
                        { className: 'dshg-log-meta' },
                        `${c.short} · ${c.author} · ${c.date}`,
                      ),
                    ),
                  ),
            ),
      );
    }

    function PanelIcon() {
      // 16px branch glyph, currentColor so selected/hover states apply.
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: 16,
          height: 16,
          'aria-hidden': true,
          style: { display: 'block', flex: 'none' },
        },
        h(
          'g',
          { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' },
          h('path', { d: 'M4.5 12V5.5' }),
          h('path', { d: 'M4.5 5.5c0-2.5 4-2.5 7-1.5' }),
          h('path', { d: 'M11.5 7v5' }),
        ),
        h('circle', { cx: 4.5, cy: 13.2, r: 1.6, fill: 'currentColor' }),
        h('circle', { cx: 4.5, cy: 4.3, r: 1.6, fill: 'currentColor' }),
        h('circle', { cx: 11.5, cy: 4.3, r: 1.6, fill: 'currentColor' }),
        h('circle', { cx: 11.5, cy: 13.2, r: 1.6, fill: 'currentColor' }),
      );
    }

    return {
      inject: ['slots', 'locale', 'sidebarRightTabs'],
      apply(ctx) {
        const disposers = [];
        const report = (stage, detail) => rawReport(stage, detail);
        report('apply-enter', `has-slots=${Boolean(ctx.get('slots'))}`);
        const locale = ctx.get('locale');
        let t = (key) => DICTS.en[key] ?? key;
        if (locale) {
          for (const [language, dict] of Object.entries(DICTS)) {
            try {
              disposers.push(locale.register('gitGui', language, dict));
            } catch {
              /* non-fatal */
            }
          }
          try {
            const bound = locale.bind('gitGui');
            t = (key) => {
              const value = bound(key);
              return typeof value === 'string' ? value : DICTS.en[key] ?? key;
            };
          } catch {
            /* keep fallback */
          }
        }

        // Track the on-screen session continuously. sidebarRight.mounted reports
        // undefined while any main panel (including ours) is active, so remember
        // the last non-undefined session id at the plugin level.
        let lastSessionId;
        const sidebarRight = ctx.get('sidebarRight');
        const mounted = sidebarRight && sidebarRight.mounted;
        const readMounted = () => {
          try {
            if (!mounted) return undefined;
            if (typeof mounted.getSnapshot === 'function') return mounted.getSnapshot();
            if (typeof mounted.get === 'function') return mounted.get();
            if (typeof mounted === 'function') return mounted();
            return mounted;
          } catch {
            return undefined;
          }
        };
        const applyMounted = () => {
          const value = readMounted();
          if (typeof value === 'string' && value) lastSessionId = value;
          else if (value && typeof value === 'object' && typeof value.id === 'string') {
            lastSessionId = value.id;
          }
        };
        applyMounted();
        if (mounted && typeof mounted.subscribe === 'function') {
          try {
            disposers.push(mounted.subscribe(applyMounted));
          } catch {
            /* best-effort */
          }
        }
        const getSessionId = () => {
          applyMounted();
          return lastSessionId;
        };

        // Registration helper: a missing parent slot declaration or service
        // must never fail plugin activation (it breaks the whole web boot).
        const safe = (label, fn) => {
          try {
            const dispose = fn();
            report(`${label}-ok`, '');
            return typeof dispose === 'function' ? dispose : () => {};
          } catch (error) {
            report(`${label}-failed`, (error && error.message) || error);
            console.error(`dsh-git-gui: ${label} unavailable:`, error);
            return () => {};
          }
        };

        // Right-sidebar tab type: the registry is a declared inject service
        // (loader guarantees ui-sidebar-right activated first).
        const tabs = ctx.sidebarRightTabs ?? ctx.get('sidebarRightTabs');
        if (tabs) {
          try {
            disposers.push(
              tabs.register({
                id: '@local/dsh-git-gui',
                kind: 'git-gui',
                title: () => t('tabTitle'),
                guide: [{ id: 'git', label: t('tabTitle'), description: t('guideDesc') }],
              }),
            );
            report('tab-type-ok', '');
          } catch (error) {
            report('tab-type-failed', (error && error.message) || error);
          }
        } else {
          report('tab-type-missing-service', '');
        }

        // Right-sidebar tab body: session-scoped keyed slot owned by
        // ui-sidebar-right; register through slots.inject on the slot itself.
        disposers.push(
          safe('rightbar seat', () =>
            ctx.slots.inject('sidebar.right.pane.tab', () =>
              ctx.slots.register(
                { name: 'sidebar.right.pane.tab', key: '@local/dsh-git-gui' },
                (props) => h(GitPanel, { ...props, ctx, t, getSessionId }),
              ),
            ),
          ),
        );

        // Global main-panel entry: left sidebar icon + full-width panel.
        // These slots are declared by ui-sidebar/ui-layout inside their own
        // children tables, so registrations ride the owner declaration via
        // slots.inject (the same pattern the shipped plugins use).
        disposers.push(
          safe('sidebar.panellist', () =>
            ctx.slots.inject('sidebar.panellist', () =>
              ctx.slots.register(
                { name: 'sidebar.panellist', id: 'git-gui', order: 20, label: () => t('panelLabel') },
                PanelIcon,
              ),
            ),
          ),
        );
        disposers.push(
          safe('main panel', () =>
            ctx.slots.inject('main', () =>
              ctx.slots.register(
                { name: 'main', key: 'git-gui' },
                (props) => h(GitPanel, { ...props, ctx, t, getSessionId }),
              ),
            ),
          ),
        );

        return () => {
          report('dispose', '');
          for (const dispose of disposers) {
            try {
              if (typeof dispose === 'function') dispose();
            } catch {
              /* ignore */
            }
          }
        };
      },
    };
  },
});
