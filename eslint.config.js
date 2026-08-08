// @ts-check
import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import importX from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

// Architecture-enforcing rules (AGENTS.md #18, ARCHITECTURE §4 / §4.3 / D-10,
// D-12b): no Prisma import outside repositories/, no req/res types inside
// services/, no cross-module deep imports, no process.env outside config/.
// Style rules are secondary here — these are the rules a merge should
// actually fail on.
//
// ⚠ Flat config does NOT merge array-valued rule options across multiple
// matching config objects for the same rule key — the last match simply
// replaces it. Each rule key below is therefore configured in exactly ONE
// config object per file class, with every restriction that applies to
// that file class combined into that one object.

const SERVICES_GLOB = 'src/modules/*/services/**/*.ts';

// `no-restricted-imports`' `patterns` option matches import source strings
// with the `ignore` package (gitignore syntax), NOT minimatch/extglob — a
// pattern like `!(*.module)` is meaningless here. Module anatomy (§4.1) is
// controllers/services/repositories/dto/validators/ plus <name>.routes.ts
// and <name>.module.ts, so the deep-import ban is spelled out per-folder
// rather than as a single "not the module file" negation.
const CROSS_MODULE_DEEP_IMPORT_PATTERNS = [
  '@/modules/*/controllers/**',
  '@/modules/*/services/**',
  '@/modules/*/repositories/**',
  '@/modules/*/dto/**',
  '@/modules/*/validators/**',
  '@/modules/*/*.routes.js',
];
const CROSS_MODULE_DEEP_IMPORT_MESSAGE =
  "Cross-module imports must go through the target module's <name>.module.ts — no deep imports into another module's internals.";

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'prisma/generated/**', '.husky/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,

  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'prisma/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({ project: './tsconfig.json' }),
        // eslint-disable-next-line import-x/no-named-as-default-member
        importX.createNodeResolver(),
      ],
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'import-x/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-cycle': 'error',
      // False positives on packages whose CJS default export is the whole
      // usable API (helmet, cors, pino, express, swagger-ui-express, …) —
      // noisy without value in this codebase.
      'import-x/no-named-as-default': 'off',
      'import-x/no-named-as-default-member': 'off',
    },
  },

  // Root-level config files (this file, prisma.config.ts) are intentionally
  // outside tsconfig.json's `include` — lint them without type-aware rules
  // rather than pulling them into the app's program.
  {
    files: ['*.config.js', '*.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },

  // ── no-restricted-syntax: process.env scoping + services' req/res ban ──
  // Combined into two mutually-exclusive file classes so neither clobbers
  // the other.
  {
    files: ['src/**/*.ts'],
    ignores: ['src/config/**', SERVICES_GLOB],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.object.name='process'][object.property.name='env']",
          message:
            'process.env may only be read inside src/config/. Add the var to env.ts instead.',
        },
      ],
    },
  },
  {
    files: [SERVICES_GLOB],
    rules: {
      // Rule 12 (process.env confined to src/config/) plus ARCHITECTURE
      // §4.1 (services never see req/res, including bare type references —
      // `no-restricted-imports` below only catches the import statement,
      // not a type used via `import type`).
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.object.name='process'][object.property.name='env']",
          message:
            'process.env may only be read inside src/config/. Add the var to env.ts instead.',
        },
        {
          selector: 'TSTypeReference[typeName.name=/^(Request|Response)$/]',
          message: "Services never see req/res — that is the controller's job.",
        },
      ],
    },
  },

  // ── no-restricted-imports: Prisma confinement + cross-module imports ──
  // Every file class that needs this rule gets exactly one block.
  {
    // D-12b / ARCHITECTURE §4.3: only repositories/ and database/ touch
    // Prisma directly.
    files: ['src/common/**/*.ts'],
    ignores: ['src/common/repositories/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@prisma/client',
              message:
                'Only repositories/ touch Prisma — go through a repository extending BaseRepository<T>.',
            },
          ],
          patterns: [
            {
              group: ['**/prisma/generated/**', '**/database/prisma.service*'],
              message:
                'Only repositories/ touch Prisma — go through a repository extending BaseRepository<T>.',
            },
          ],
        },
      ],
    },
  },
  {
    // ARCHITECTURE §4 / AGENTS §5: cross-module imports only through
    // `<name>.module.ts`.
    files: ['src/modules/**/*.ts'],
    ignores: [SERVICES_GLOB],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: CROSS_MODULE_DEEP_IMPORT_PATTERNS,
              message: CROSS_MODULE_DEEP_IMPORT_MESSAGE,
            },
          ],
        },
      ],
    },
  },
  {
    // Services get all three: Prisma ban, req/res value-import ban, and the
    // cross-module ban — combined here since they'd otherwise collide with
    // the two blocks above.
    files: [SERVICES_GLOB],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@prisma/client',
              message:
                'Services never touch Prisma directly — go through a repository extending BaseRepository<T>.',
            },
            {
              name: 'express',
              importNames: ['Request', 'Response', 'NextFunction'],
              message: "Services never see req/res — that is the controller's job.",
            },
          ],
          patterns: [
            {
              group: ['**/prisma/generated/**', '**/database/prisma.service*'],
              message:
                'Services never touch Prisma directly — go through a repository extending BaseRepository<T>.',
            },
            {
              group: CROSS_MODULE_DEEP_IMPORT_PATTERNS,
              message: CROSS_MODULE_DEEP_IMPORT_MESSAGE,
            },
          ],
        },
      ],
    },
  },

  eslintConfigPrettier,
);
