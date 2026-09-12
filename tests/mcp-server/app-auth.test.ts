import { expect, test } from "bun:test";
import { authenticateAppKey, isAppKeyRequest } from "../../apps/mcp-server/src/app-auth";
const key = `ooxml_app_${"a".repeat(64)}`;
const hash = new Bun.CryptoHasher("sha256").update(key).digest("hex");
const request = (token: string) => new Request("https://api.ooxml.dev/mcp", {headers: {Authorization: `Bearer ${token}`}});

test("only the configured app key authenticates; missing, rotated and malformed keys fail", async () => {
 expect(await authenticateAppKey(request(key), hash)).toEqual({userId: null, appId: "pip", clientId: "pip", scopes: ["ooxml:read"]});
 for (const configured of [undefined, "", "0".repeat(64), "invalid"]) {
  expect(await authenticateAppKey(request(key), configured)).toBeNull();
 }
 for (const token of ["", "oauth-token", `${key}a`, key.replace(/a$/, "b")]) {
  expect(await authenticateAppKey(request(token), hash)).toBeNull();
 }
 expect(isAppKeyRequest(request("oauth-token"))).toBe(false);
 expect(await authenticateAppKey(new Request("https://api.ooxml.dev/mcp", {headers: {Authorization: key}}), hash)).toBeNull();
});

