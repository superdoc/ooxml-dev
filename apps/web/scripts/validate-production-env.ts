const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
	throw new Error("A Clerk publishable key is missing from the production environment file");
}

if (!publishableKey.startsWith("pk_live_")) {
	throw new Error("Production builds require a live Clerk publishable key");
}

console.log("✓ Production Clerk publishable key is configured");
