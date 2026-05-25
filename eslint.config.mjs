import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Engine code MUST use seeded RNG, not Math.random()
    files: ["lib/engine/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message:
            "Math.random() is forbidden in engine code. Use the seeded RNG from lib/engine/rng.ts to keep simulations reproducible.",
        },
      ],
    },
  },
];

export default eslintConfig;
