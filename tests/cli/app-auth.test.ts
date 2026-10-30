import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectToMcp } from "../../apps/cli/src/mcp-client";
import { authenticateAppKey } from "../../apps/mcp-server/src/app-auth";
import { createAuthenticatedMcpHandler, type UsageEvent } from "../../apps/mcp-server/src/mcp-auth";
import { executeMcpTool } from "../../apps/mcp-server/src/mcp";

const key = `ooxml_app_${"a".repeat(64)}`;
const hash = new Bun.CryptoHasher("sha256").update(key).digest("hex");

test("app CLI calls a real reference tool, attributes Pip, and never opens OAuth storage", async () => {
 const directory = await mkdtemp(join(tmpdir(), "ooxml-app-"));
 const previousKey = process.env.OOXML_API_KEY;
 const previousDir = process.env.OOXML_CONFIG_DIR;
 const originalFetch = globalThis.fetch;
 const events: UsageEvent[] = [];
 const handler = createAuthenticatedMcpHandler({
  usageRecorder: { record: (event) => { events.push(event); } },
  toolExecutor: (name, args) => executeMcpTool(name, args, { DATABASE_URL: "", VOYAGE_API_KEY: "" } as never),
 });
 let configuredHash: string | undefined = hash;
 globalThis.fetch = (async (input, init) => {
  const request = new Request(input, init);
  expect(request.url).toBe("https://api.ooxml.dev/mcp");
  expect(request.redirect).toBe("error");
  const identity = await authenticateAppKey(request, configuredHash);
  return identity ? handler(request, identity) : new Response("Unauthorized", { status: 401 });
 }) as typeof fetch;
 process.env.OOXML_API_KEY = key;
 process.env.OOXML_CONFIG_DIR = directory;
 try {
  const connection = await connectToMcp({ allowBrowser: true, callbackPort: 53682 });
  try {
   const result = await connection.client.callTool({name: "ooxml_preset_shape", arguments: { shape: "round2SameRect" }});
   expect(JSON.stringify(result)).toContain("adj1");
   expect(events).toHaveLength(1);
   expect(events[0]).toMatchObject({userId: null, appId: "pip", client: "pip", tool: "ooxml_preset_shape"});
  } finally { await connection.close(); }
  configuredHash = undefined;
  await expect(connectToMcp({allowBrowser: true, callbackPort: 53682})).rejects.toThrow("OOXML application connection failed");
  process.env.OOXML_API_KEY = "";
  await expect(connectToMcp({allowBrowser: true, callbackPort: 53682})).rejects.toThrow("not a valid application key");
  expect(await readdir(directory)).toEqual([]);
 } finally {
  globalThis.fetch = originalFetch;
  if (previousKey === undefined) delete process.env.OOXML_API_KEY; else process.env.OOXML_API_KEY = previousKey;
  if (previousDir === undefined) delete process.env.OOXML_CONFIG_DIR; else process.env.OOXML_CONFIG_DIR = previousDir;
  await rm(directory, { recursive: true });
 }
});
