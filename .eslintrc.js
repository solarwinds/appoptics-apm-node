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
    'node/handle-callback-err': 'warn',
    'node/no-deprecated-api': 'warn',
    'camelcase': 'warn',
    'no-eval': 'warn'
  }
}
