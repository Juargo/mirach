// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import vitest from '@vitest/eslint-plugin';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      // `_`-prefijo = intencionalmente sin usar (ej. `_next` en el error
      // middleware de 4 args de Express, `_ws` en una strategy); `ignoreRestSiblings`
      // habilita el rest-omit de destructuring. Consistente con la config de apps/web.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
  {
    // Falla si un `.only` (it.only/describe.only) queda en un test: en CI
    // silenciaría el resto de la suite y dejaría pasar un build en falso.
    files: ['**/*.spec.ts', '**/*.int-spec.ts', '**/*.e2e-spec.ts'],
    plugins: { vitest },
    languageOptions: {
      globals: { ...vitest.environments.env.globals },
    },
    rules: {
      'vitest/no-focused-tests': 'error',
    },
  },
  {
    // Los tests ejercen `any` A PROPÓSITO: `res.body` de supertest, mocks sin
    // bind (`expect(x.metodo)`), factories. Las reglas type-checked
    // `no-unsafe-*` / `unbound-method` / `require-await` valen oro en `src`
    // pero son puro ruido acá — se relajan SOLO para archivos de test (nunca en
    // producción). `no-unused-vars` NO se relaja: el dead code en tests igual se
    // reporta.
    files: [
      '**/*.spec.ts',
      '**/*.int-spec.ts',
      '**/*.e2e-spec.ts',
      'test/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },
  {
    // ADR-005 boundary tripwire: domain/application must stay framework- and
    // env-agnostic. `config/env` is infrastructure-adjacent (parses
    // process.env, ADR-029) — only composition/infrastructure may import it.
    // Needed values must be injected as parameters (see createPrismaClient,
    // crearAuth, createApiKeyMiddleware for the established pattern).
    files: ['src/domain/**/*.ts', 'src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/config/env', '**/config/env.js', '**/config/env.ts'],
              message:
                'domain/application must not import config/env (ADR-005 boundary). Inject the needed Env values as parameters instead.',
            },
          ],
        },
      ],
    },
  },
);
