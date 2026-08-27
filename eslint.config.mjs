import { createEndgeEslintConfig } from './eslint.endge.config.mjs'

export default createEndgeEslintConfig({
  name: 'endge-nova-datatable/published-vue-event-contract',
  files: ['src/vue/NovaDataTable.vue'],
  rules: {
    // FE-VUE-EVENT-001 override: сохраняется до отдельной SemVer-миграции public API.
    'vue/custom-event-name-casing': ['error', 'kebab-case'],
  },
})
