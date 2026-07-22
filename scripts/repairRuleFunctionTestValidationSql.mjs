import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = path.join(root, 'outputs', 'rule_function_test_data_20260722', '03_validation.sql')
const original = fs.readFileSync(file, 'utf8')
const repaired = original.replace(/^\+/gm, '')
fs.writeFileSync(file, repaired, 'utf8')
console.log(JSON.stringify({ file, removedLeadingMarkers: (original.match(/^\+/gm) || []).length, passed: !/^\+/m.test(repaired) }, null, 2))
