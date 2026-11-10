/**
 * dsh-skill-manager — host half.
 *
 * Scans the skill roots the filesystem provider uses (project `.dsh/skills`,
 * project `.agents/skills`, the user DSH home, the shared agents home and the
 * bundled office skills), parses each `SKILL.md` frontmatter and serves the
 * result to the browser half over loopback-only same-origin routes:
 *
 *   GET  /api/dsh-skill-manager/list    → roots + discovered skills
 *   GET  /api/dsh-skill-manager/read    → one SKILL.md body
 *   POST /api/dsh-skill-manager/save    → write an edited SKILL.md
 *   POST /api/dsh-skill-manager/create  → create `<name>/SKILL.md` in a root
 *   POST /api/dsh-skill-manager/remove  → delete a skill (dir or flat file)
 *   POST /api/dsh-skill-manager/reveal  → show the skill in the OS file manager
 *
 * Every path that arrives from the browser is fenced to the scanned roots, so
 * the routes can only read, write or delete things that are already skills.
 * The module deliberately imports only Node builtins: the plugin has to resolve
 * from any profile layout (npm, pnpm link, workspace link).
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/** Cordis plugin name (also the client bundle's module id). */
export const name = "skill-manager";

/** The host web server is the only service this half needs. */
export const inject = ["webServer"];

/** Route paths shared with the browser half (spelled here, not imported). */
export const API = {
	list: "/api/dsh-skill-manager/list",
	read: "/api/dsh-skill-manager/read",
	save: "/api/dsh-skill-manager/save",
	create: "/api/dsh-skill-manager/create",
	remove: "/api/dsh-skill-manager/remove",
	reveal: "/api/dsh-skill-manager/reveal"
};

/** Root ranks mirror `dsh-skill-filesystem`; a lower rank wins a duplicate name. */
const RANK = {
	projectDsh: 100,
	projectAgents: 200,
	userDsh: 400,
	userAgents: 500,
	bundled: 600
};

/** A skill name the registry accepts: kebab-case ASCII. */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Largest request body a route accepts, in bytes. */
const BODY_LIMIT = 4 * 1024 * 1024;

/* ------------------------------------------------------------------ *
 * Paths and roots
 * ------------------------------------------------------------------ */

/** The harness home: `$DSH_HOME`, else `~/.dsh`. */
function dshHome() {
	return process.env.DSH_HOME !== undefined && process.env.DSH_HOME !== ""
		? process.env.DSH_HOME
		: path.join(homedir(), ".dsh");
}

/** The shared agents home: `$DSH_AGENTS_HOME`, else `~/.agents`. */
function agentsHome() {
	return process.env.DSH_AGENTS_HOME !== undefined && process.env.DSH_AGENTS_HOME !== ""
		? process.env.DSH_AGENTS_HOME
		: path.join(homedir(), ".agents");
}

/** Absolute paths of every workspace the profile knows, newest first. */
function workspaceList() {
	const file = path.join(dshHome(), "storages", "workspace.json");
	let parsed;
	try {
		parsed = JSON.parse(readFileSync(file, "utf8"));
	} catch {
		return [];
	}
	const table = parsed?.tables?.workspaces;
	if (table === null || typeof table !== "object") return [];
	const rows = Object.values(table).filter((row) => row !== null && typeof row === "object" && typeof row.path === "string");
	rows.sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
	return rows.map((row) => ({ path: row.path, title: typeof row.title === "string" && row.title !== "" ? row.title : path.basename(row.path) }));
}

/** Bundled skill directories this build may ship. */
function bundledSkillDirs() {
	const dirs = [];
	if (process.env.DSH_BUNDLED_SKILL_DIR !== undefined && process.env.DSH_BUNDLED_SKILL_DIR !== "") dirs.push(process.env.DSH_BUNDLED_SKILL_DIR);
	// The desktop app keeps its shipped skills beside the executable.
	dirs.push(path.join(path.dirname(process.execPath), "resources", "runtime", "office-skills"));
	return dirs;
}

/** Normalized comparison key for a directory path. */
function pathKey(value) {
	const resolved = path.resolve(value);
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/**
 * The skill library the panel creates skills in. Defaults to `E:\dsh-skills`
 * (a folder beside `E:\dsh-plugins`), overridable with
 * `$DSH_SKILL_LIBRARY_DIR`; falls back to the user skill root when the drive is
 * absent. The library is junctioned from `<dshHome>/skills`, so the filesystem
 * provider keeps discovering what the panel writes here.
 * @returns {string} absolute library directory.
 */
function skillLibraryDir() {
	const override = process.env.DSH_SKILL_LIBRARY_DIR;
	if (override !== undefined && override.trim() !== "") return path.resolve(override.trim());
	if (process.platform === "win32" && existsSync("E:\\")) return path.join("E:\\", "dsh-skills");
	return path.join(dshHome(), "skills");
}

/**
 * Every skill root that exists on this machine, in registry priority order.
 * Dashed directories are skipped the way the filesystem provider skips them.
 * @returns {Array<{id: string, kind: string, label: string, path: string, rank: number, writable: boolean}>}
 */
function skillRoots() {
	const seen = new Set();
	const roots = [];
	const push = (root, always) => {
		const exists = existsSync(root.path);
		if (!exists && always !== true) return;
		if (exists) {
			let key;
			try {
				key = pathKey(realpathSync(root.path));
			} catch {
				return;
			}
			if (seen.has(key)) return;
			seen.add(key);
		}
		roots.push({ ...root, exists });
	};

	const library = skillLibraryDir();
	const userRoot = path.join(dshHome(), "skills");
	const libraryDiffers = pathKey(library) !== pathKey(userRoot);
	// The library is only advertised as the primary root when it is the same real
	// directory as the user root (a junction): otherwise the model catalog would
	// never see what the panel writes there.
	let libraryLinked = false;
	try {
		libraryLinked = pathKey(realpathSync(library)) === pathKey(realpathSync(userRoot));
	} catch {
		libraryLinked = false;
	}
	if (libraryDiffers && libraryLinked) {
		push(
			{
				id: "library",
				kind: "library",
				label: `技能库 · ${displayPath(library)}`,
				path: library,
				rank: RANK.userDsh,
				writable: true,
				primary: true
			},
			true
		);
	}
	push(
		{
			id: "user",
			kind: "user",
			label: "用户 · ~/.dsh/skills",
			path: userRoot,
			rank: RANK.userDsh,
			writable: true,
			primary: !(libraryDiffers && libraryLinked)
		},
		false
	);

	for (const workspace of workspaceList()) {
		const label = workspace.title;
		push(
			{
				id: `project:${pathKey(workspace.path)}`,
				kind: "project",
				label: `${label} · .dsh/skills`,
				path: path.join(workspace.path, ".dsh", "skills"),
				rank: RANK.projectDsh,
				writable: true
			},
			true
		);
		push(
			{
				id: `project-agents:${pathKey(workspace.path)}`,
				kind: "project",
				label: `${label} · .agents/skills`,
				path: path.join(workspace.path, ".agents", "skills"),
				rank: RANK.projectAgents,
				writable: true
			},
			true
		);
	}

	push({
		id: "user",
		kind: "user",
		label: "用户 · ~/.dsh/skills",
		path: path.join(dshHome(), "skills"),
		rank: RANK.userDsh,
		writable: true
	});
	push({
		id: "agents",
		kind: "agents",
		label: "共享 · ~/.agents/skills",
		path: path.join(agentsHome(), "skills"),
		rank: RANK.userAgents,
		writable: true
	});
	for (const dir of bundledSkillDirs()) {
		push({
			id: `bundled:${pathKey(dir)}`,
			kind: "bundled",
			label: "内置 · office 技能",
			path: dir,
			rank: RANK.bundled,
			writable: false
		});
	}
	return roots.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
}

/** Short display form of an absolute path, with the home directory folded. */
function displayPath(value) {
	const home = homedir();
	const resolved = path.resolve(value);
	if (pathKey(resolved).startsWith(pathKey(home) + path.sep)) return `~${resolved.slice(home.length)}`;
	return resolved;
}

/* ------------------------------------------------------------------ *
 * SKILL.md parsing
 * ------------------------------------------------------------------ */

/** Frontmatter boolean spellings the filesystem provider accepts. */
const TRUE_SOURCE = /^(?:true|yes|on|1)$/i;
const FALSE_SOURCE = /^(?:false|no|off|0)$/i;

/** Strip one layer of YAML quotes from a scalar. */
function unquote(raw) {
	const value = raw.trim();
	if (value.length >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
		return value.slice(1, -1).replace(/\\"/g, "\"").replace(/\\\\/g, "\\").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
	}
	if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
	const comment = value.indexOf(" #");
	return comment === -1 ? value : value.slice(0, comment).trimEnd();
}

/**
 * Split YAML frontmatter into top-level scalars and the markdown body. Nested
 * mappings (`metadata:` blocks) are skipped on purpose: the catalog only reads
 * the top-level keys, and the body is edited verbatim.
 * @param {string} text - the whole SKILL.md.
 * @returns {{data: Record<string, string>, body: string, hasFrontmatter: boolean}}
 */
function parseFrontmatter(text) {
	const normalized = text.replace(/^\uFEFF/, "");
	const lines = normalized.split(/\r?\n/);
	if (lines[0] === undefined || lines[0].trim() !== "---") return { data: {}, body: normalized, hasFrontmatter: false };
	let end = -1;
	for (let index = 1; index < lines.length; index += 1) {
		const line = lines[index].trim();
		if (line === "---" || line === "...") {
			end = index;
			break;
		}
	}
	if (end === -1) return { data: {}, body: normalized, hasFrontmatter: false };
	const data = {};
	for (let index = 1; index < end; index += 1) {
		const line = lines[index];
		if (line === undefined || line.trim() === "" || line.trim().startsWith("#")) continue;
		if (/^\s/.test(line) || line.trim().startsWith("-")) continue;
		const match = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line);
		if (match === null) continue;
		data[match[1]] = unquote(match[2]);
	}
	return { data, body: lines.slice(end + 1).join("\n"), hasFrontmatter: true };
}

/** Read a frontmatter flag with the provider's strict boolean grammar. */
function readFlag(value, fallback) {
	if (value === undefined) return fallback;
	if (TRUE_SOURCE.test(value)) return true;
	if (FALSE_SOURCE.test(value)) return false;
	return undefined;
}

/* ------------------------------------------------------------------ *
 * Discovery
 * ------------------------------------------------------------------ */

/** The skill file behind a directory entry, or null when it is not a skill. */
function skillFileOf(rootPath, entry) {
	if (entry.isDirectory()) {
		if (entry.name.startsWith(".")) return null;
		const file = path.join(rootPath, entry.name, "SKILL.md");
		return existsSync(file) ? { file, dir: path.join(rootPath, entry.name) } : null;
	}
	if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) return null;
	return { file: path.join(rootPath, entry.name), dir: rootPath };
}

/**
 * Parse one skill file into a catalog row. Malformed frontmatter does not hide
 * the row: the manager shows it with the reason it would be skipped.
 */
function readSkill(fileInfo, root) {
	const match = /^(.+)\.md$/i.exec(path.basename(fileInfo.file));
	const fallbackName = match === null ? path.basename(fileInfo.file) : match[1];
	let text;
	let stat;
	try {
		text = readFileSync(fileInfo.file, "utf8");
		stat = statSync(fileInfo.file);
	} catch (error) {
		return {
			name: fallbackName,
			description: "",
			path: fileInfo.file,
			dir: fileInfo.dir,
			rootId: root.id,
			source: root.kind,
			sourceLabel: root.label,
			rank: root.rank,
			modelInvocable: false,
			userInvocable: false,
			valid: false,
			problem: `无法读取：${error instanceof Error ? error.message : String(error)}`,
			shadowed: false,
			bytes: 0,
			mtimeMs: 0
		};
	}
	const parsed = parseFrontmatter(text);
	const declaredName = typeof parsed.data.name === "string" && parsed.data.name !== "" ? parsed.data.name : "";
	const declaredDescription = typeof parsed.data.description === "string" ? parsed.data.description : "";
	const modelFlag = readFlag(parsed.data["disable-model-invocation"], false);
	const userFlag = readFlag(parsed.data["user-invocable"], true);
	let problem;
	if (!parsed.hasFrontmatter) problem = "缺少 YAML frontmatter";
	else if (declaredDescription === "") problem = "缺少 description";
	else if (modelFlag === undefined) problem = "disable-model-invocation 不是布尔值";
	else if (userFlag === undefined) problem = "user-invocable 不是布尔值";
	else if (!SKILL_NAME.test(declaredName)) problem = declaredName === "" ? "缺少 name" : `name 不是 kebab-case：${declaredName}`;
	return {
		name: declaredName !== "" ? declaredName : fallbackName,
		description: declaredDescription,
		whenToUse: typeof parsed.data.whenToUse === "string" ? parsed.data.whenToUse : "",
		path: fileInfo.file,
		dir: fileInfo.dir,
		rootId: root.id,
		source: root.kind,
		sourceLabel: root.label,
		rank: root.rank,
		modelInvocable: modelFlag === true ? false : true,
		userInvocable: userFlag === false ? false : true,
		valid: problem === undefined,
		problem: problem ?? null,
		shadowed: false,
		bytes: stat.size,
		mtimeMs: stat.mtimeMs
	};
}

/**
 * The merged catalog: every root scanned in rank order, first name wins, later
 * same-name skills kept as `shadowed` rows so the manager can explain them.
 * @returns {{roots: Array<object>, skills: Array<object>}}
 */
function discover() {
	const roots = skillRoots();
	const winners = new Map();
	const skills = [];
	for (const root of roots) {
		let entries;
		try {
			entries = readdirSync(root.path, { withFileTypes: true });
		} catch {
			continue;
		}
		entries.sort((a, b) => a.name.localeCompare(b.name));
		for (const entry of entries) {
			const fileInfo = skillFileOf(root.path, entry);
			if (fileInfo === null) continue;
			const skill = readSkill(fileInfo, root);
			const existing = winners.get(skill.name);
			if (existing !== undefined) {
				skills.push({ ...skill, shadowed: true, shadowedBy: existing.sourceLabel });
				continue;
			}
			winners.set(skill.name, skill);
			skills.push(skill);
		}
	}
	skills.sort((a, b) => {
		if (a.shadowed !== b.shadowed) return a.shadowed ? 1 : -1;
		return a.name.localeCompare(b.name);
	});
	return {
		roots: roots.map((root) => ({
			id: root.id,
			kind: root.kind,
			label: root.label,
			path: root.path,
			displayPath: displayPath(root.path),
			rank: root.rank,
			writable: root.writable,
			exists: root.exists,
			primary: root.primary === true
		})),
		library: displayPath(skillLibraryDir()),
		skills
	};
}

/* ------------------------------------------------------------------ *
 * Path fencing
 * ------------------------------------------------------------------ */

/** Whether a resolved path is a root itself or lives under one. */
function insideRoots(candidate, roots) {
	let real;
	try {
		real = path.resolve(realpathSync(candidate));
	} catch {
		real = path.resolve(candidate);
	}
	const key = process.platform === "win32" ? real.toLowerCase() : real;
	for (const root of roots) {
		let rootReal;
		try {
			rootReal = path.resolve(realpathSync(root.path));
		} catch {
			rootReal = path.resolve(root.path);
		}
		const rootKey = process.platform === "win32" ? rootReal.toLowerCase() : rootReal;
		if (key === rootKey) return root;
		if (key.startsWith(rootKey + path.sep)) return root;
	}
	return undefined;
}

/** 400 helper: the path is missing, not a markdown file, or outside the roots. */
function requireSkillPath(raw, roots) {
	if (typeof raw !== "string" || raw === "") throw new RequestError(400, "缺少 path");
	const resolved = path.resolve(raw);
	if (!resolved.toLowerCase().endsWith(".md")) throw new RequestError(400, "只能操作 .md 文件");
	const root = insideRoots(resolved, roots);
	if (root === undefined) throw new RequestError(403, "路径不在任何技能根目录下");
	if (!existsSync(resolved) || !statSync(resolved).isFile()) throw new RequestError(404, "文件不存在");
	return { path: resolved, root };
}

/* ------------------------------------------------------------------ *
 * HTTP plumbing
 * ------------------------------------------------------------------ */

/** An error with the status code the route should answer with. */
class RequestError extends Error {
	/** @param {number} status @param {string} message */
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}

/** Whether the caller is on the loopback interface. */
function isLoopbackRequest(req) {
	const address = req.socket?.remoteAddress ?? "";
	return address === "::1" || address === "::ffff:127.0.0.1" || address === "127.0.0.1" || address === "localhost" || address.startsWith("::ffff:127.");
}

/** Write one JSON response. */
function writeJson(res, status, value) {
	const payload = JSON.stringify(value);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"content-length": Buffer.byteLength(payload)
	});
	res.end(payload);
}

/** The request's JSON body, bounded by BODY_LIMIT. */
async function readBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > BODY_LIMIT) throw new RequestError(413, "请求体过大");
		chunks.push(chunk);
	}
	if (size === 0) return {};
	try {
		const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		return value !== null && typeof value === "object" ? value : {};
	} catch {
		throw new RequestError(400, "请求体不是合法 JSON");
	}
}

/** Mount one route with its method guard and error mapping. */
function route(method, routePath, handler) {
	return {
		kind: "exact",
		path: routePath,
		handler: async (req, res) => {
			if (!isLoopbackRequest(req)) {
				writeJson(res, 403, { error: "forbidden: loopback-only" });
				return;
			}
			if ((req.method ?? "GET") !== method) {
				writeJson(res, 405, { error: `method not allowed: ${req.method}` });
				return;
			}
			try {
				writeJson(res, 200, await handler(req));
			} catch (error) {
				const status = error instanceof RequestError ? error.status : 500;
				writeJson(res, status, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	};
}

/* ------------------------------------------------------------------ *
 * Route table
 * ------------------------------------------------------------------ */

/** Serialize a `SKILL.md` the manager creates. */
function renderSkillFile(name, description, body) {
	const quote = (value) => {
		if (/^[A-Za-z0-9\u4e00-\u9fa5][^:#\n]*$/.test(value) && !/^\s|\s$/.test(value)) return value;
		return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n")}"`;
	};
	const trimmed = body.replace(/\r\n/g, "\n").replace(/^\n+/, "");
	return `---\nname: ${quote(name)}\ndescription: ${quote(description)}\n---\n\n${trimmed === "" ? `# ${name}\n` : trimmed.endsWith("\n") ? trimmed : `${trimmed}\n`}`;
}

/** The route table for the skill manager. */
function makeRoutes() {
	return [
		route("GET", API.list, async () => {
			const catalog = discover();
			return { ...catalog, scannedAt: Date.now(), platform: process.platform };
		}),

		route("GET", API.read, async (req) => {
			const url = new URL(req.url ?? "/", "http://localhost");
			const roots = skillRoots();
			const { path: file } = requireSkillPath(url.searchParams.get("path"), roots);
			const content = readFileSync(file, "utf8");
			const stat = statSync(file);
			return { path: file, content, bytes: stat.size, mtimeMs: stat.mtimeMs };
		}),

		route("POST", API.save, async (req) => {
			const body = await readBody(req);
			const roots = skillRoots();
			const { path: file, root } = requireSkillPath(body.path, roots);
			if (!root.writable) throw new RequestError(403, "该技能目录是只读的");
			if (typeof body.content !== "string") throw new RequestError(400, "缺少 content");
			writeFileSync(file, body.content, "utf8");
			const stat = statSync(file);
			return { ok: true, path: file, bytes: stat.size, mtimeMs: stat.mtimeMs };
		}),

		route("POST", API.create, async (req) => {
			const body = await readBody(req);
			const roots = skillRoots().filter((root) => root.writable);
			const root = roots.find((candidate) => candidate.id === body.rootId);
			if (root === undefined) throw new RequestError(400, "请选择一个可写的技能目录");
			if (typeof body.name !== "string" || !SKILL_NAME.test(body.name)) throw new RequestError(400, "技能名必须是 kebab-case（小写字母、数字、连字符）");
			if (typeof body.description !== "string" || body.description.trim() === "") throw new RequestError(400, "description 不能为空");
			const dir = path.join(root.path, body.name);
			const file = path.join(dir, "SKILL.md");
			if (existsSync(dir)) throw new RequestError(409, `目录已存在：${displayPath(dir)}`);
			mkdirSync(dir, { recursive: true });
			writeFileSync(file, renderSkillFile(body.name, body.description.trim(), typeof body.body === "string" ? body.body : ""), "utf8");
			const stat = statSync(file);
			return { ok: true, path: file, dir, bytes: stat.size, mtimeMs: stat.mtimeMs };
		}),

		route("POST", API.remove, async (req) => {
			const body = await readBody(req);
			const roots = skillRoots();
			const { path: file, root } = requireSkillPath(body.path, roots);
			if (!root.writable) throw new RequestError(403, "该技能目录是只读的");
			if (path.basename(file) === "SKILL.md") {
				const dir = path.dirname(file);
				rmSync(dir, { recursive: true, force: true });
				return { ok: true, removed: displayPath(dir), kind: "bundle" };
			}
			rmSync(file, { force: true });
			return { ok: true, removed: displayPath(file), kind: "flat" };
		}),

		route("POST", API.reveal, async (req) => {
			const body = await readBody(req);
			const roots = skillRoots();
			const { path: file } = requireSkillPath(body.path, roots);
			if (process.platform === "win32") {
				spawn("explorer.exe", [`/select,${file}`], { detached: true, stdio: "ignore" }).unref();
			} else if (process.platform === "darwin") {
				spawn("open", ["-R", file], { detached: true, stdio: "ignore" }).unref();
			} else {
				spawn("xdg-open", [path.dirname(file)], { detached: true, stdio: "ignore" }).unref();
			}
			return { ok: true, path: file };
		})
	];
}

/** Cordis plugin body: register the skill-management routes. */
export function apply(ctx) {
	const disposers = makeRoutes().map((entry) => ctx.webServer.register(entry));
	ctx.effect(() => () => {
		for (const dispose of disposers) {
			try {
				dispose();
			} catch {
				/* the server may already be gone */
			}
		}
	}, "skill-manager: routes");
}
