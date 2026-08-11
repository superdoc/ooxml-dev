const AUTO_CLOSE_SECONDS = 5;

/**
 * The OAuth callback is served by the CLI on localhost, so this page must not
 * depend on assets from ooxml.dev that may be unavailable once login finishes.
 */
export function oauthSuccessPage(): string {
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Connected · ooxml.dev</title>
	<style>
		:root {
			color-scheme: light;
			--accent: #c2410c;
			--accent-hover: #9a3412;
			--background: #fafaf9;
			--card: #ffffff;
			--border: #e7e5e4;
			--text: #1c1917;
			--text-secondary: #57534e;
			--text-muted: #78716c;
			--green: #00853d;
			--green-background: #f0fdf4;
			--green-border: #bbf7d0;
		}

		* { box-sizing: border-box; }

		body {
			margin: 0;
			min-height: 100vh;
			display: grid;
			place-items: center;
			padding: 24px 16px;
			background: var(--background);
			color: var(--text);
			font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
			-webkit-font-smoothing: antialiased;
		}

		.card {
			position: relative;
			width: 100%;
			max-width: 384px;
			overflow: hidden;
			padding: 32px;
			border: 1px solid var(--border);
			border-radius: 14px;
			background: var(--card);
			box-shadow: 0 1px 2px rgb(28 25 23 / 4%), 0 8px 24px rgb(28 25 23 / 4%);
			text-align: center;
		}

		.logo {
			display: flex;
			align-items: baseline;
			justify-content: center;
			gap: 1px;
			margin-bottom: 24px;
			font-size: 19px;
			font-weight: 700;
			letter-spacing: -0.02em;
		}

		.bracket {
			color: var(--accent);
			font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
			font-weight: 500;
		}

		.check {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 48px;
			height: 48px;
			margin: 0 auto 18px;
			border: 1px solid var(--green-border);
			border-radius: 50%;
			background: var(--green-background);
			animation: pop 400ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
		}

		.check svg { stroke: var(--green); }

		.check path {
			stroke-dasharray: 24;
			stroke-dashoffset: 24;
			animation: draw 400ms ease-out 250ms forwards;
		}

		h1 {
			margin: 0 0 6px;
			font-size: 20px;
			font-weight: 600;
			letter-spacing: -0.01em;
		}

		.sub {
			margin: 0;
			color: var(--text-secondary);
			font-size: 14px;
			line-height: 1.5;
		}

		.close-note {
			margin: 22px 0 0;
			color: var(--text-muted);
			font-size: 13px;
			line-height: 1.5;
		}

		.countdown { font-variant-numeric: tabular-nums; }

		.cancel {
			padding: 0;
			border: 0;
			background: none;
			color: var(--accent);
			font: inherit;
			font-weight: 500;
			cursor: pointer;
		}

		.cancel:hover { color: var(--accent-hover); }
		.cancel:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

		.drain {
			position: absolute;
			bottom: 0;
			left: 0;
			width: 100%;
			height: 3px;
			background: var(--green);
			transform-origin: left;
			animation: drain ${AUTO_CLOSE_SECONDS}s linear forwards;
		}

		.drain.cancelled { display: none; }

		@keyframes pop {
			from { opacity: 0; transform: scale(0.6); }
			to { opacity: 1; transform: scale(1); }
		}

		@keyframes draw { to { stroke-dashoffset: 0; } }
		@keyframes drain { to { transform: scaleX(0); } }

		@media (prefers-reduced-motion: reduce) {
			.check, .check path { animation: none; }
			.check path { stroke-dashoffset: 0; }
			.drain { animation-timing-function: steps(${AUTO_CLOSE_SECONDS}, end); }
		}
	</style>
</head>
<body>
	<main class="card">
		<div class="logo" aria-label="ooxml.dev">
			<span class="bracket" aria-hidden="true">&lt;</span>ooxml.dev<span class="bracket" aria-hidden="true">/&gt;</span>
		</div>

		<div class="check" aria-hidden="true">
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="M4 12.5l5 5L20 6.5" />
			</svg>
		</div>

		<h1>Connected</h1>
		<p class="sub">You're signed in.<br />Head back to your terminal.</p>
		<p class="close-note" aria-live="polite">
			Closing this tab in <span class="countdown">${AUTO_CLOSE_SECONDS}</span>s ·
			<button class="cancel" type="button">keep it open</button>
		</p>
		<div class="drain" aria-hidden="true"></div>
	</main>

	<script>
		(() => {
			const totalSeconds = ${AUTO_CLOSE_SECONDS};
			let secondsLeft = totalSeconds;
			let timer;
			const note = document.querySelector(".close-note");
			const countdown = document.querySelector(".countdown");
			const cancel = document.querySelector(".cancel");
			const drain = document.querySelector(".drain");

			const showManualClose = () => {
				clearInterval(timer);
				drain.classList.add("cancelled");
				note.textContent = "You can close this tab whenever you like.";
			};

			cancel.addEventListener("click", showManualClose);

			timer = setInterval(() => {
				secondsLeft -= 1;
				countdown.textContent = String(Math.max(0, secondsLeft));
				if (secondsLeft > 0) return;

				clearInterval(timer);
				window.close();
				setTimeout(showManualClose, 250);
			}, 1000);
		})();
	</script>
</body>
</html>`;
}
