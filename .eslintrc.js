module.exports = {
  env: {
    commonjs: true,
    es2021: true,
    node: true
  },
  plugins: ['yaml'],
  extends: [
    'standard',
    'plugin:yaml/recommended',
    'plugin:json/recommended'
  ],
  parserOptions: {
    ecmaVersion: 12
  },
  rules: {
    'n/handle-callback-err': 'warn',
    'n/no-deprecated-api': 'warn',
    camelcase: 'warn',
    'no-eval': 'warn'
  },
  overrides: [{
    files: ['test/probes/*.test.js'],
    rules: {
      'n/handle-callback-err': 'off'
    }
  }]
}
