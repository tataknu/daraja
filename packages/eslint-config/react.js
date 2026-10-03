// base + React hooks and fast-refresh rules, for apps and UI packages.
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import base from "./base.js";

export default tseslint.config(...base, {
  files: ["**/*.{ts,tsx}"],
  plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
  rules: {
    ...reactHooks.configs.recommended.rules,
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "server-only",
            message:
              "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
          },
        ],
      },
    ],
  },
});
