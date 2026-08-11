import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router-dom";
import { DocsLayout } from "./pages/docs/Layout";
import { DocsPage } from "./pages/docs/Page";
import { Home } from "./pages/Home";
import { Mcp } from "./pages/Mcp";
import { NotFound } from "./pages/NotFound";
import { SpecExplorer } from "./pages/SpecExplorer";
import "./index.css";

const router = createBrowserRouter([
	{
		element: <Outlet />,
		children: [
			{ path: "/", element: <Home /> },
			{ path: "/mcp", element: <Mcp /> },
			{ path: "/spec", element: <SpecExplorer /> },
			{
				lazy: async () => {
					const { AuthProvider } = await import("./pages/auth/AuthProvider");
					return { Component: AuthProvider };
				},
				children: [
					{
						path: "/sign-in/*",
						lazy: async () => {
							const { SignIn } = await import("./pages/auth/SignIn");
							return { Component: SignIn };
						},
					},
					{
						path: "/sign-up/*",
						lazy: async () => {
							const { SignUp } = await import("./pages/auth/SignUp");
							return { Component: SignUp };
						},
					},
				],
			},
			{
				path: "/docs",
				element: <DocsLayout />,
				children: [
					{ index: true, element: <DocsPage slug="index" /> },
					{ path: "*", element: <DocsPage /> },
				],
			},
			{ path: "*", element: <NotFound /> },
		],
	},
]);

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
