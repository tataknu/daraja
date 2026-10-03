import react from "@turflow/eslint-config/react";

export default [
  ...react,
  // Generated (TanStack router, Lovable's Supabase integration) or vendored (React Bits) code.
  {
    ignores: [
      "src/routeTree.gen.ts",
      "src/integrations/supabase/**",
      "src/components/reactbits/**",
    ],
  },
  // Route files export a Route object next to their component by design.
  { files: ["src/routes/**"], rules: { "react-refresh/only-export-components": "off" } },
];
