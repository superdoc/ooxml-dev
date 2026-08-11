import { createClerkClient } from "@clerk/backend";
import { isClerkAPIResponseError } from "@clerk/backend/errors";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
if (!databaseUrl || !clerkSecretKey) {
	throw new Error("DATABASE_URL and CLERK_SECRET_KEY are required");
}

const sql = neon(databaseUrl);
const clerk = createClerkClient({ secretKey: clerkSecretKey, telemetry: { disabled: true } });
const rows = await sql<
	Array<{
		clerk_user_id: string;
		last_seen_at: string;
		call_count: string;
		tools: string[];
	}>
>`
	SELECT
		clerk_user_id,
		MAX(occurred_at)::text AS last_seen_at,
		COUNT(*)::text AS call_count,
		ARRAY_AGG(DISTINCT tool_name ORDER BY tool_name) AS tools
	FROM mcp_usage_events
	GROUP BY clerk_user_id
	ORDER BY MAX(occurred_at) DESC
	LIMIT 100
`;

console.log("USER ID\tNAME\tEMAIL\tCALLS\tLAST SEEN\tTOOLS");
for (const row of rows) {
	let name = "";
	let email = "";
	try {
		const user = await clerk.users.getUser(row.clerk_user_id);
		name = [user.firstName, user.lastName].filter(Boolean).join(" ");
		email =
			user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress ??
			"";
	} catch (error) {
		if (!isClerkAPIResponseError(error) || error.status !== 404) throw error;
		name = "(deleted user)";
	}

	console.log(
		[row.clerk_user_id, name, email, row.call_count, row.last_seen_at, row.tools.join(",")].join(
			"\t",
		),
	);
}
