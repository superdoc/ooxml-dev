import { describe, expect, test } from "bun:test";
import { oauthSuccessPage } from "../../scripts/oauth-callback-page";

describe("OAuth callback success page", () => {
	test("renders Variant 1 without external assets", () => {
		const html = oauthSuccessPage();

		expect(html).toContain("<h1>Connected</h1>");
		expect(html).toContain("Head back to your terminal.");
		expect(html).toContain('class="countdown">5</span>s');
		expect(html).toContain("keep it open");
		expect(html).toContain('class="drain"');
		expect(html).not.toContain("https://");
	});

	test("attempts to close after the countdown and provides a fallback", () => {
		const html = oauthSuccessPage();

		expect(html).toContain("secondsLeft -= 1");
		expect(html).toContain("window.close()");
		expect(html).toContain('cancel.addEventListener("click", showManualClose)');
		expect(html).toContain("You can close this tab whenever you like.");
	});
});
