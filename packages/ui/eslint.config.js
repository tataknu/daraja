import react from "@daraja/eslint-config/react";

export default [
  ...react,
  // shadcn components export their variant helpers (e.g. buttonVariants) next to the component.
  { rules: { "react-refresh/only-export-components": "off" } },
];
