/**
 * Smoke test for the host half: mount the routes on a fake Cordis context and
 * drive them with fake req/res objects, so the discovery, parsing and fencing
 * logic can be exercised without the desktop app.
 */
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";

const modulePath = pathToFileURL("E:/test/dsh-skill-manager/lib/index.js").href;
const plugin = await import(modulePath);

const routes = new Map();
const ctx = {
	webServer: {
		register(route) {
			routes.set(route.path, route);
			return () => routes.delete(route.path);
		}
	},
	effect(fn) {
		fn();
	}
};
plugin.apply(ctx);
console.log("routes:", [...routes.keys()].join(" "));

function makeReq(method, url, body) {
	const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
	req.method = method;
	req.url = url;
	req.socket = { remoteAddress: "127.0.0.1" };
	return req;
}

function makeRes() {
	return {
		status: 0,
		payload: "",
		writeHead(status) {
			this.status = status;
		},
		end(value) {
			this.payload = value;
		}
	};
}

async function call(method, routePath, { query, body } = {}) {
	const route = routes.get(routePath);
	const url = routePath + (query === undefined ? "" : `?${new URLSearchParams(query).toString()}`);
	const res = makeRes();
	await route.handler(makeReq(method, url, body), res);
	return { status: res.status, data: res.payload === "" ? null : JSON.parse(res.payload) };
}

const list = await call("GET", plugin.API.list);
console.log("list status:", list.status);
console.log("roots:");
for (const root of list.data.roots) console.log(`  [${root.rank}] ${root.kind.padEnd(8)} ${root.path} writable=${root.writable}`);
console.log("skills:", list.data.skills.length);
for (const skill of list.data.skills) {
	console.log(`  ${skill.shadowed ? "(shadowed)" : "         "} ${skill.name.padEnd(34)} ${String(skill.source).padEnd(8)} ${skill.modelInvocable ? "model " : "       "} ${skill.userInvocable ? "user " : "     "} ${skill.valid ? "ok  " : "BAD "} ${skill.problem ?? ""} ${skill.path}`);
}

const first = list.data.skills.find((skill) => skill.valid);
if (first !== undefined) {
	const read = await call("GET", plugin.API.read, { query: { path: first.path } });
	console.log("read:", read.status, "bytes:", read.data.bytes, "head:", JSON.stringify(read.data.content.slice(0, 40)));
}

// Fencing: a path outside every root must be refused.
const outside = await call("POST", plugin.API.save, { body: { path: "C:/Windows/win.ini", content: "x" } });
console.log("fenced save:", outside.status, outside.data.error);

// Method guard.
const wrongMethod = await call("GET", plugin.API.save, { body: {} });
console.log("method guard:", wrongMethod.status, wrongMethod.data.error);
