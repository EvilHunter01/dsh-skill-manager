window.__ModuleLoader__.load({
	id: "dsh-skill-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const h = react.createElement;
		const { useCallback, useEffect, useMemo, useRef, useState } = react;

		/** Keyed id of the panel: the sidebar row and the `main` slot share it. */
		const PANEL_ID = "skill-manager";
		/** Sidebar order: the built-in 插件 row is 0, 自动化任务 is 10. */
		const PANEL_ORDER = 5;
		/** UI copy; the product ships Chinese, an English browser gets English. */
		const ZH = (navigator.language || "").toLowerCase().startsWith("zh");
		const copy = ZH
			? {
					panel: "技能管理",
					title: "技能管理",
					subtitle: (total, library, roots) => (library === "" ? `共 ${total} 个本地技能 · ${roots} 个根目录` : `共 ${total} 个本地技能 · 技能库 ${library}`),
					search: "搜索名称或描述",
					refresh: "刷新",
					creating: "新建技能",
					chat: "去使用",
					chatHint: "用这个技能开一个新对话",
					all: "全部",
					library: "技能库",
					user: "用户",
					project: "项目",
					agents: "共享",
					bundled: "内置",
					modelYes: "模型可调用",
					modelNo: "不进模型目录",
					userNo: "不可手动调用",
					invalid: "格式有问题",
					emptyTitle: "还没有本地技能",
					emptyHint: "在 ~/.dsh/skills 或项目的 .dsh/skills 下放一个 SKILL.md 就会出现在这里。",
					noMatch: "没有匹配的技能",
					selectHint: "从左侧选一个技能查看 SKILL.md",
					loading: "正在读取…",
					readError: "读取失败",
					createTitle: "新建技能",
					name: "名称",
					nameHint: "kebab-case，例如 my-skill",
					description: "描述",
					descHint: "一句话说明它何时该用",
					body: "正文（可选）",
					bodyHint: "留空会生成一个标题占位",
					root: "保存位置",
					cancel: "取消",
					confirm: "确定",
					created: "已创建",
					invalidBanner: (problem) => `这个技能不会被加载：${problem}`,
					shadowNotice: (count) => `另有 ${count} 个同名技能被更高优先级的目录覆盖`,
					retry: "重试",
					creatingBusy: "创建中…"
				}
			: {
					panel: "Skills",
					title: "Skills",
					subtitle: (total, library, roots) => (library === "" ? `${total} local skills across ${roots} roots` : `${total} local skills · library ${library}`),
					search: "Search name or description",
					refresh: "Refresh",
					creating: "New skill",
					chat: "Use it",
					chatHint: "Start a new conversation with this skill",
					all: "All",
					library: "Library",
					user: "User",
					project: "Project",
					agents: "Shared",
					bundled: "Built-in",
					modelYes: "model-invocable",
					modelNo: "hidden from model",
					userNo: "not user-invocable",
					invalid: "invalid",
					emptyTitle: "No local skills yet",
					emptyHint: "Drop a SKILL.md under ~/.dsh/skills or a project's .dsh/skills and it shows up here.",
					noMatch: "No matching skills",
					selectHint: "Pick a skill on the left to read its SKILL.md",
					loading: "Reading…",
					readError: "Could not read this skill",
					createTitle: "New skill",
					name: "Name",
					nameHint: "kebab-case, e.g. my-skill",
					description: "Description",
					descHint: "One sentence on when to use it",
					body: "Body (optional)",
					bodyHint: "Leave empty for a heading placeholder",
					root: "Save under",
					cancel: "Cancel",
					confirm: "Confirm",
					created: "Created",
					invalidBanner: (problem) => `This skill will not load: ${problem}`,
					shadowNotice: (count) => `${count} same-name skill(s) are shadowed by a higher-priority root`,
					retry: "Retry",
					creatingBusy: "Creating…"
				};

		const API = {
			list: "/api/dsh-skill-manager/list",
			read: "/api/dsh-skill-manager/read",
			create: "/api/dsh-skill-manager/create"
		};

		const css = `
.dshsm{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}
.dshsm-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;padding:calc(var(--dsh-frame-top-clearance,0px) + 20px) 24px 14px;flex:none}
.dshsm-title{margin:0;font-size:20px;line-height:28px;font-weight:600}
.dshsm-sub{margin:3px 0 0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.dshsm-headActions{display:flex;gap:8px;flex:none}
.dshsm-btn{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 14px;border-radius:9px;border:1px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;font-weight:500;line-height:22px;cursor:pointer;white-space:nowrap}
.dshsm-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dshsm-btn:disabled{opacity:.45;cursor:default}
.dshsm-btn[data-variant=primary]{background:var(--dsw-alias-button-primary-fill);border-color:transparent;color:var(--dsw-alias-label-primary-foreground)}
.dshsm-btn[data-variant=primary]:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.dshsm-btn[data-variant=danger]{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-border-l2)}
.dshsm-btn[data-variant=danger]:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}
.dshsm-tools{display:flex;align-items:center;gap:8px;padding:0 24px 14px;flex-wrap:wrap;flex:none}
.dshsm-search{position:relative;display:flex;align-items:center;flex:1 1 240px;max-width:420px}
.dshsm-search svg{position:absolute;left:11px;color:var(--dsw-alias-label-tertiary);pointer-events:none}
.dshsm-search input{width:100%;height:34px;box-sizing:border-box;padding:0 12px 0 32px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;font-size:14px;outline:none}
.dshsm-search input:focus{border-color:var(--dsw-alias-brand-primary)}
.dshsm-chips{display:flex;gap:6px;flex-wrap:wrap}
.dshsm-chip{height:28px;padding:0 12px;border-radius:999px;border:1px solid transparent;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;font-weight:500;cursor:pointer}
.dshsm-chip:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshsm-chip[data-active=true]{background:var(--dsw-alias-interactive-bg-active);border-color:var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary)}
.dshsm-body{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:minmax(300px,380px) minmax(0,1fr);border-top:1px solid var(--dsw-alias-border-l2)}
.dshsm-list{min-height:0;overflow:auto;padding:8px;border-right:1px solid var(--dsw-alias-border-l2);display:flex;flex-direction:column;gap:3px}
.dshsm-listFoot{padding:10px 12px 4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dshsm-item{display:flex;flex-direction:column;gap:5px;padding:9px 11px;border-radius:9px;border:1px solid transparent;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dshsm-item:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshsm-item[data-selected=true]{background:var(--dsw-alias-interactive-bg-active);border-color:var(--dsw-alias-border-l3)}
.dshsm-itemTop{display:flex;align-items:center;gap:6px;min-width:0}
.dshsm-name{font-size:14px;line-height:20px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshsm-desc{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:13px;line-height:19px;color:var(--dsw-alias-label-secondary)}
.dshsm-tags{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.dshsm-tag{font-size:12px;line-height:19px;padding:0 7px;border-radius:5px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);font-weight:500;white-space:nowrap}
.dshsm-tag[data-tone=source]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.dshsm-dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:5px;vertical-align:1px;background:var(--dsw-alias-label-tertiary)}
.dshsm-dot[data-kind=library]{background:var(--dsw-alias-brand-primary)}
.dshsm-dot[data-kind=project]{background:var(--dsw-alias-state-success-primary)}
.dshsm-dot[data-kind=user]{background:var(--dsw-alias-state-business-primary)}
.dshsm-dot[data-kind=agents]{background:var(--dsw-alias-label-tertiary)}
.dshsm-tag[data-tone=ok]{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 14%,transparent);color:var(--dsw-alias-state-success-primary)}
.dshsm-tag[data-tone=warn]{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 18%,transparent);color:var(--dsw-alias-state-warn-label)}
.dshsm-tag[data-tone=error]{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);color:var(--dsw-alias-state-error-primary)}
.dshsm-tag[data-tone=muted]{background:transparent;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.dshsm-detail{min-height:0;overflow:auto;padding:20px 26px 26px;display:flex;flex-direction:column;gap:13px}
.dshsm-detailHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.dshsm-detailTitle{margin:0;font-size:18px;line-height:26px;font-weight:600;word-break:break-all}
.dshsm-path{font-family:var(--dsh-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);word-break:break-all}
.dshsm-banner{padding:9px 11px;border-radius:9px;border:1px solid var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-label);font-size:13px;line-height:20px}
.dshsm-banner[data-tone=error]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.dshsm-editor{flex:1 1 auto;min-height:320px;width:100%;box-sizing:border-box;resize:vertical;padding:13px 15px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:inherit;font-family:var(--dsh-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:13px;line-height:1.7;tab-size:2;outline:none}
.dshsm-editor:focus{border-color:var(--dsw-alias-brand-primary)}
.dshsm-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;height:100%;min-height:240px;padding:24px;text-align:center;color:var(--dsw-alias-label-tertiary)}
.dshsm-emptyTitle{font-size:15px;line-height:22px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.dshsm-emptyHint{max-width:380px;font-size:13px;line-height:20px}
.dshsm-overlay{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.35)}
.dshsm-dialog{width:min(600px,94vw);max-height:84vh;overflow:auto;display:flex;flex-direction:column;gap:12px;padding:20px 22px;border-radius:14px;border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1);box-shadow:0 16px 48px rgba(0,0,0,.28)}
.dshsm-dialogTitle{margin:0;font-size:17px;line-height:24px;font-weight:600}
.dshsm-field{display:flex;flex-direction:column;gap:5px}
.dshsm-label{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.dshsm-input,.dshsm-select{height:36px;box-sizing:border-box;padding:0 10px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:inherit;font:inherit;font-size:14px;outline:none}
.dshsm-input:focus,.dshsm-select:focus,.dshsm-textarea:focus{border-color:var(--dsw-alias-brand-primary)}
.dshsm-textarea{min-height:110px;box-sizing:border-box;padding:10px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:inherit;font-family:var(--dsh-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:13px;line-height:1.65;resize:vertical;outline:none}
.dshsm-dialogFoot{display:flex;justify-content:flex-end;gap:8px;padding-top:2px}
.dshsm-toast{position:fixed;right:20px;bottom:20px;z-index:1300;padding:10px 15px;border-radius:10px;border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-3);font-size:14px;line-height:22px;box-shadow:0 8px 24px rgba(0,0,0,.2)}
.dshsm-toast[data-kind=error]{color:var(--dsw-alias-state-error-primary)}
@media (max-width:820px){.dshsm-body{grid-template-columns:minmax(0,1fr)}.dshsm-list{border-right:none;border-bottom:1px solid var(--dsw-alias-border-l2);max-height:44%}}
`;

		/** Mount the stylesheet once per document. */
		const STYLE_ID = "dsh-skill-manager/styles.css";
		if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-skill-manager";
			tag.dataset.pluginCss = STYLE_ID;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		/* ------------------------------------------------------------------ *
		 * Icons
		 * ------------------------------------------------------------------ */

		/** Shared outline-icon props. */
		function glyphProps(size) {
			return {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.6,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true
			};
		}

		function BookGlyph({ size = 16 }) {
			return h(
				"svg",
				glyphProps(size),
				h("path", { key: "body", d: "M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z" }),
				h("path", { key: "spine", d: "M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3" }),
				h("path", { key: "star", d: "M15.4 7.2l.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9z" })
			);
		}

		function SearchGlyph({ size = 14 }) {
			return h("svg", glyphProps(size), h("circle", { cx: 11, cy: 11, r: 7 }), h("path", { d: "m20 20-3.6-3.6" }));
		}

		function PlusGlyph({ size = 14 }) {
			return h("svg", glyphProps(size), h("path", { d: "M12 5v14M5 12h14" }));
		}

		function RefreshGlyph({ size = 14 }) {
			return h(
				"svg",
				glyphProps(size),
				h("path", { d: "M20 11a8 8 0 1 0-2.3 6.3" }),
				h("path", { d: "M20 4v7h-7" })
			);
		}

		function ChatGlyph({ size = 14 }) {
			return h(
				"svg",
				glyphProps(size),
				h("path", { d: "M20 12a7.5 7.5 0 0 1-7.5 7.5H7L4 21l.9-3.6A7.5 7.5 0 1 1 20 12z" }),
				h("path", { d: "M8.5 11.5h7M8.5 14.5h4.5" })
			);
		}

		/* ------------------------------------------------------------------ *
		 * Helpers
		 * ------------------------------------------------------------------ */

		/** One JSON request against the host half. */
		async function request(method, url, body) {
			const init = { method, headers: { accept: "application/json" } };
			if (body !== undefined) {
				init.headers["content-type"] = "application/json";
				init.body = JSON.stringify(body);
			}
			const response = await fetch(url, init);
			const text = await response.text();
			let data = null;
			try {
				data = text === "" ? null : JSON.parse(text);
			} catch {
				throw new Error(text.slice(0, 200) || `HTTP ${response.status}`);
			}
			if (!response.ok) throw new Error((data && (data.error || data.message)) || `HTTP ${response.status}`);
			return data;
		}

		/** `2026-11-10 16:54` in local time. */

		/** Sidebar copy for one source kind. */
		function kindLabel(kind) {
			return copy[kind] ?? kind;
		}

		/** The tag strip under a skill name; every facet gets its own tint. */
		function SkillTags({ skill }) {
			const tags = [];
			tags.push(
				h(
					"span",
					{ key: "source", className: "dshsm-tag", "data-tone": "source" },
					h("span", { key: "dot", className: "dshsm-dot", "data-kind": skill.source }),
					kindLabel(skill.source)
				)
			);
			if (skill.valid) {
				tags.push(h("span", { key: "model", className: "dshsm-tag", "data-tone": skill.modelInvocable ? "ok" : "warn" }, skill.modelInvocable ? copy.modelYes : copy.modelNo));
				if (!skill.userInvocable) tags.push(h("span", { key: "user", className: "dshsm-tag", "data-tone": "muted" }, copy.userNo));
			} else {
				tags.push(h("span", { key: "bad", className: "dshsm-tag", "data-tone": "error" }, copy.invalid));
			}
			return h("div", { className: "dshsm-tags" }, tags);
		}

		/** Full-pane placeholder. */
		function EmptyPane({ title, hint, icon }) {
			return h(
				"div",
				{ className: "dshsm-empty" },
				icon === false ? null : h(BookGlyph, { size: 28 }),
				title === undefined ? null : h("div", { className: "dshsm-emptyTitle" }, title),
				hint === undefined ? null : h("div", { className: "dshsm-emptyHint" }, hint)
			);
		}

		/* ------------------------------------------------------------------ *
		 * Page
		 * ------------------------------------------------------------------ */

		/**
		 * The skills page: catalog on the left, a read-only SKILL.md view on the
		 * right. Skills change through a conversation with the agent, so this page
		 * never writes; it only reads the catalog and the selected file.
		 * @param props - `onUseSkill(skill)` starts a new session with that skill
		 * referenced (injected by apply).
		 */
		function SkillManagerPage(props) {
			const onUseSkill = props !== undefined && typeof props.onUseSkill === "function" ? props.onUseSkill : undefined;
			const [catalog, setCatalog] = useState({ status: "loading", roots: [], skills: [], library: "", error: null, scannedAt: 0 });
			const [query, setQuery] = useState("");
			const [kind, setKind] = useState("all");
			const [selectedPath, setSelectedPath] = useState(null);
			const [editor, setEditor] = useState({ status: "idle", content: "", error: null, mtimeMs: 0, bytes: 0 });
			const [toast, setToast] = useState(null);
			const [dialog, setDialog] = useState(null);
			const [createForm, setCreateForm] = useState({ rootId: "", name: "", description: "", body: "" });
			const [createError, setCreateError] = useState(null);
			const [busy, setBusy] = useState(false);
			const toastTimer = useRef(null);
			const readToken = useRef(0);

			const showToast = useCallback((text, kindName) => {
				setToast({ text, kind: kindName ?? "ok" });
				if (toastTimer.current !== null) clearTimeout(toastTimer.current);
				toastTimer.current = setTimeout(() => setToast(null), 2600);
			}, []);
			useEffect(() => () => {
				if (toastTimer.current !== null) clearTimeout(toastTimer.current);
			}, []);

			const load = useCallback(async (silent) => {
				setCatalog((previous) => ({ ...previous, status: previous.skills.length > 0 && silent === true ? previous.status : "loading", error: null }));
				try {
					const data = await request("GET", API.list);
					setCatalog({ status: "ready", roots: data.roots ?? [], skills: data.skills ?? [], library: data.library ?? "", error: null, scannedAt: data.scannedAt ?? Date.now() });
				} catch (error) {
					setCatalog((previous) => ({ ...previous, status: "error", error: error instanceof Error ? error.message : String(error) }));
				}
			}, []);

			useEffect(() => {
				load();
			}, [load]);

			const skills = catalog.skills;
			const live = useMemo(() => skills.filter((skill) => !skill.shadowed), [skills]);
			const shadowedCount = skills.length - live.length;

			const visible = useMemo(() => {
				const needle = query.trim().toLowerCase();
				return live.filter((skill) => {
					if (kind !== "all" && skill.source !== kind) return false;
					if (needle === "") return true;
					return skill.name.toLowerCase().includes(needle) || String(skill.description ?? "").toLowerCase().includes(needle);
				});
			}, [live, kind, query]);

			const selected = useMemo(() => skills.find((skill) => skill.path === selectedPath) ?? null, [skills, selectedPath]);

			// Keep the detail pane in sync with the list: when the visible set changes
			// (filter chip, search) and the selected skill is filtered out, select the
			// first visible skill instead of leaving a stale detail behind.
			useEffect(() => {
				if (catalog.status !== "ready") return;
				if (selectedPath !== null && visible.some((skill) => skill.path === selectedPath)) return;
				const next = visible.find((skill) => skill.valid) ?? visible[0];
				setSelectedPath(next === undefined ? null : next.path);
			}, [catalog.status, visible, selectedPath]);

			// Load the selected file body.
			useEffect(() => {
				if (selectedPath === null) {
					setEditor({ status: "idle", content: "", error: null, mtimeMs: 0, bytes: 0 });
					return undefined;
				}
				const token = readToken.current + 1;
				readToken.current = token;
				setEditor({ status: "loading", content: "", error: null, mtimeMs: 0, bytes: 0 });
				request("GET", `${API.read}?path=${encodeURIComponent(selectedPath)}`)
					.then((data) => {
						if (readToken.current !== token) return;
						setEditor({ status: "ready", content: data.content, error: null, mtimeMs: data.mtimeMs, bytes: data.bytes });
					})
					.catch((error) => {
						if (readToken.current !== token) return;
						setEditor({ status: "error", content: "", error: error instanceof Error ? error.message : String(error), mtimeMs: 0, bytes: 0 });
					});
				return undefined;
			}, [selectedPath]);

			const selectSkill = useCallback(
				(skill) => {
					if (skill.path !== selectedPath) setSelectedPath(skill.path);
				},
				[selectedPath]
			);

			const openCreate = useCallback(() => {
				// Default to the E: skill library (the primary root), not a project root.
				const writable = catalog.roots.filter((root) => root.writable);
				const preferred = writable.find((root) => root.primary) ?? writable[0];
				setCreateForm({ rootId: preferred === undefined ? "" : preferred.id, name: "", description: "", body: "" });
				setCreateError(null);
				setDialog("create");
			}, [catalog.roots]);

			const submitCreate = useCallback(async () => {
				if (busy) return;
				setBusy(true);
				setCreateError(null);
				try {
					const data = await request("POST", API.create, createForm);
					setDialog(null);
					setBusy(false);
					showToast(copy.created);
					await load(true);
					setSelectedPath(data.path);
				} catch (error) {
					setBusy(false);
					setCreateError(error instanceof Error ? error.message : String(error));
				}
			}, [busy, createForm, load, showToast]);

			// Escape closes a dialog.
			useEffect(() => {
				if (dialog === null) return undefined;
				const onKeyDown = (event) => {
					if (event.key === "Escape") {
						setDialog(null);
						setCreateError(null);
					}
				};
				window.addEventListener("keydown", onKeyDown);
				return () => window.removeEventListener("keydown", onKeyDown);
			}, [dialog]);

			const kinds = useMemo(() => {
				const counts = new Map();
				for (const skill of live) counts.set(skill.source, (counts.get(skill.source) ?? 0) + 1);
				const order = ["library", "user", "project", "agents", "bundled"];
				const chips = [{ id: "all", label: copy.all, count: live.length }];
				for (const id of order) {
					if ((counts.get(id) ?? 0) === 0) continue;
					chips.push({ id, label: kindLabel(id), count: counts.get(id) });
				}
				return chips;
			}, [live]);

			const header = h(
				"header",
				{ className: "dshsm-head" },
				h(
					"div",
					null,
					h("h1", { className: "dshsm-title" }, copy.title),
					h("p", { className: "dshsm-sub" }, catalog.status === "ready" ? copy.subtitle(live.length, catalog.library, catalog.roots.length) : catalog.status === "error" ? catalog.error : copy.loading)
				),
				h(
					"div",
					{ className: "dshsm-headActions" },
					h(
						"button",
						{ type: "button", className: "dshsm-btn", onClick: () => load(true), disabled: catalog.status === "loading", title: copy.refresh },
						h(RefreshGlyph),
						copy.refresh
					),
					h(
						"button",
						{ type: "button", className: "dshsm-btn", onClick: openCreate, disabled: catalog.roots.every((root) => !root.writable) },
						h(PlusGlyph),
						copy.creating
					)
				)
			);

			const tools = h(
				"div",
				{ className: "dshsm-tools" },
				h(
					"div",
					{ className: "dshsm-search" },
					h(SearchGlyph),
					h("input", { type: "search", value: query, placeholder: copy.search, onChange: (event) => setQuery(event.target.value), spellCheck: false })
				),
				h(
					"div",
					{ className: "dshsm-chips" },
					kinds.map((chip) =>
						h(
							"button",
							{ key: chip.id, type: "button", className: "dshsm-chip", "data-active": kind === chip.id, onClick: () => setKind(chip.id) },
							`${chip.label} ${chip.count}`
						)
					)
				)
			);

			let listContent;
			if (catalog.status === "loading" && live.length === 0) {
				listContent = h(EmptyPane, { title: copy.loading, icon: false });
			} else if (catalog.status === "error" && live.length === 0) {
				listContent = h(
					"div",
					{ className: "dshsm-empty" },
					h("div", { className: "dshsm-emptyTitle" }, catalog.error),
					h("button", { type: "button", className: "dshsm-btn", onClick: () => load() }, copy.retry)
				);
			} else if (live.length === 0) {
				listContent = h(EmptyPane, { title: copy.emptyTitle, hint: copy.emptyHint });
			} else if (visible.length === 0) {
				listContent = h(EmptyPane, { title: copy.noMatch, icon: false });
			} else {
				listContent = visible.map((skill) =>
					h(
						"button",
						{ key: skill.path, type: "button", className: "dshsm-item", "data-selected": skill.path === selectedPath, onClick: () => selectSkill(skill), title: skill.path },
						h("div", { className: "dshsm-itemTop" }, h("span", { className: "dshsm-name" }, skill.name)),
						h("div", { className: "dshsm-desc" }, skill.description === "" ? "—" : skill.description),
						h(SkillTags, { skill })
					)
				);
			}

			const list = h(
				"div",
				{ className: "dshsm-list" },
				listContent,
				shadowedCount === 0 ? null : h("div", { className: "dshsm-listFoot" }, copy.shadowNotice(shadowedCount))
			);

			let detail;
			if (selected === null) {
				detail = h("div", { className: "dshsm-detail" }, h(EmptyPane, { title: copy.selectHint }));
			} else if (editor.status === "loading") {
				detail = h("div", { className: "dshsm-detail" }, h(EmptyPane, { title: copy.loading, icon: false }));
			} else if (editor.status === "error") {
				detail = h(
					"div",
					{ className: "dshsm-detail" },
					h("div", { className: "dshsm-banner", "data-tone": "error" }, `${copy.readError}：${editor.error}`),
					h("div", null, h("button", { type: "button", className: "dshsm-btn", onClick: () => setSelectedPath(selected.path) }, copy.retry))
				);
			} else {
				detail = h(
					"div",
					{ className: "dshsm-detail" },
					h(
						"div",
						{ className: "dshsm-detailHead" },
						h(
							"div",
							{ style: { minWidth: 0 } },
							h("h2", { className: "dshsm-detailTitle" }, selected.name),
							h("div", { style: { marginTop: 4 } }, h(SkillTags, { skill: selected })),
							h("div", { className: "dshsm-path", style: { marginTop: 6 } }, selected.path)
						),
						h(
							"button",
							{
								type: "button",
								className: "dshsm-btn",
								"data-variant": "primary",
								onClick: () => (onUseSkill === undefined ? undefined : onUseSkill(selected)),
								disabled: onUseSkill === undefined,
								title: copy.chatHint
							},
							h(ChatGlyph),
							copy.chat
						)
					),
					selected.valid ? null : h("div", { className: "dshsm-banner" }, copy.invalidBanner(selected.problem)),
					h("textarea", {
						className: "dshsm-editor",
						value: editor.content,
						readOnly: true,
						spellCheck: false,
						"aria-readonly": "true"
					})
				);
			}

			const body = h("div", { className: "dshsm-body" }, list, detail);

			const createDialog =
				dialog !== "create"
					? null
					: h(
							"div",
							{ className: "dshsm-overlay", onMouseDown: (event) => event.target === event.currentTarget && setDialog(null) },
							h(
								"div",
								{ className: "dshsm-dialog", role: "dialog", "aria-modal": "true", "aria-label": copy.createTitle },
								h("h3", { className: "dshsm-dialogTitle" }, copy.createTitle),
								h(
									"label",
									{ className: "dshsm-field" },
									h("span", { className: "dshsm-label" }, copy.root),
									h(
										"select",
										{ className: "dshsm-select", value: createForm.rootId, onChange: (event) => setCreateForm((previous) => ({ ...previous, rootId: event.target.value })) },
										catalog.roots
											.filter((root) => root.writable)
											.slice()
											.sort((a, b) => Number(b.primary === true) - Number(a.primary === true))
											.map((root) => h("option", { key: root.id, value: root.id }, root.exists === false ? `${root.displayPath}（空）` : root.displayPath))
									)
								),
								h(
									"label",
									{ className: "dshsm-field" },
									h("span", { className: "dshsm-label" }, copy.name),
									h("input", {
										className: "dshsm-input",
										value: createForm.name,
										placeholder: copy.nameHint,
										spellCheck: false,
										onChange: (event) => setCreateForm((previous) => ({ ...previous, name: event.target.value }))
									})
								),
								h(
									"label",
									{ className: "dshsm-field" },
									h("span", { className: "dshsm-label" }, copy.description),
									h("input", {
										className: "dshsm-input",
										value: createForm.description,
										placeholder: copy.descHint,
										spellCheck: false,
										onChange: (event) => setCreateForm((previous) => ({ ...previous, description: event.target.value }))
									})
								),
								h(
									"label",
									{ className: "dshsm-field" },
									h("span", { className: "dshsm-label" }, copy.body),
									h("textarea", {
										className: "dshsm-textarea",
										value: createForm.body,
										placeholder: copy.bodyHint,
										spellCheck: false,
										onChange: (event) => setCreateForm((previous) => ({ ...previous, body: event.target.value }))
									})
								),
								createError === null ? null : h("div", { className: "dshsm-banner", "data-tone": "error" }, createError),
								h(
									"div",
									{ className: "dshsm-dialogFoot" },
									h("button", { type: "button", className: "dshsm-btn", onClick: () => setDialog(null), disabled: busy }, copy.cancel),
									h("button", { type: "button", className: "dshsm-btn", "data-variant": "primary", onClick: submitCreate, disabled: busy }, busy ? copy.creatingBusy : copy.confirm)
								)
							)
						);

			return h(
				"div",
				{ className: "dshsm" },
				header,
				tools,
				body,
				createDialog,
				toast === null ? null : h("div", { className: "dshsm-toast", "data-kind": toast.kind }, toast.text)
			);
		}

		/* ------------------------------------------------------------------ *
		 * Plugin
		 * ------------------------------------------------------------------ */

		/** Required client services: the slot registry owns both seats. */
		const inject = ["slots", "uiWorkspace"];

		/**
		 * Register the page and its sidebar row. The row uses order 5, which
		 * seats 技能管理 between 插件 (0) and 自动化任务 (10). The detail pane's
		 * 去使用 button opens a new conversation through `uiWorkspace.startSession()`
		 * — the same call the sidebar's New Session button makes — and seeds the
		 * draft with the selected skill's `/name` reference.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			ctx.slots.inject("main", () =>
				ctx.slots.register(
					{
						name: "main",
						key: PANEL_ID,
						inject: () => ({
							onUseSkill: (skill) => {
								// A user-invocable skill goes into the new draft as the `/name`
								// reference, so the conversation is visibly tied to this skill.
								const reference = skill !== null && skill !== undefined && skill.valid === true && skill.userInvocable !== false ? `/${skill.name} ` : undefined;
								if (reference === undefined) ctx.uiWorkspace.startSession();
								else ctx.uiWorkspace.startSession(undefined, { prompt: reference, whenDraftExists: "append" });
							}
						})
					},
					SkillManagerPage
				)
			);
			ctx.slots.inject("sidebar.panellist", () =>
				ctx.slots.register(
					{
						name: "sidebar.panellist",
						id: PANEL_ID,
						order: PANEL_ORDER,
						label: copy.panel
					},
					BookGlyph
				)
			);
		}

		exports.PANEL_ID = PANEL_ID;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
