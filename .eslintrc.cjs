// eslint-disable-next-line import/no-extraneous-dependencies
const { rules } = require('eslint-plugin-jsx-a11y');

const a11yOff = Object.keys(rules).reduce((acc, rule) => {
  acc[`jsx-a11y/${rule}`] = 'off';
  return acc;
}, {});

module.exports = {
  root: true,
  env: {
    node: true,
    browser: true,
    es6: true,
    jest: true,
  },
  parser: '@babel/eslint-parser',
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  plugins: ['react', 'prettier'],
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 2018,
    sourceType: 'module',
    requireConfigFile: false,
    babelOptions: {
      babelrc: false,
      configFile: false,
      presets: ['@babel/preset-react'],
    },
    allowImportExportEverywhere: true,
  },
  extends: [
    'plugin:react/jsx-runtime',
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'airbnb',
    'prettier',
  ],
  rules: {
    'import/no-cycle': 1,
    'prettier/prettier': 'error',
    'no-unexpected-multiline': 2,
    'max-len': [
      'error',
      {
        code: 100,
        ignoreUrls: true,
        ignoreComments: true,
        ignoreTemplateLiterals: true,
        ignoreStrings: true,
      },
    ],
    'no-plusplus': 'off',
    'react/jsx-props-no-spreading': 'off',
    'react/forbid-prop-types': ['error', { forbid: ['any'] }],
    'react/function-component-definition': 'off',
    'no-console': ['error', { allow: ['warn', 'error'] }],
    'arrow-body-style': 'off',
    'prefer-arrow-callback': 'off',
    indent: 'off',
    'react/jsx-filename-extension': 'warn', // Allow JSX in .js files. When we move to TypeScript, we can remove this.
    ...a11yOff,
    'react/react-in-jsx-scope': 'off', // React >= 17 doesn't require importing React in every file
    'react/prop-types': 'off',
    'class-methods-use-this': 'off',
  },
  settings: {
    'import/resolver': {
      alias: {
        map: [
          ['components', './src/components'],
          ['util', './src/util'],
          ['hooks', './src/hooks'],
          ['ducks', './src/ducks'],
          ['config', './src/config'],
          ['context', './src/context'],
          ['containers', './src/containers'],
        ],
        extensions: ['.js', '.jsx', '.json'],
      },
      node: {
        extensions: ['.js', '.jsx'],
        paths: ['server', 'src'],
      },
    },
  },
};
