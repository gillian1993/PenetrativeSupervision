import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import { initializeDataGraphDatabase } from '../dataGraphApi.js'
import { importRuleCatalog, initializeRuleCatalogDatabase, previewRuleCatalogImport } from '../ruleCatalogService.js'
import { initializeSceneRuleDatabase } from '../sceneRuleService.js'

const root=dirname(dirname(fileURLToPath(import.meta.url)))
function loadEnv(){const file=join(root,'.env.local');if(!existsSync(file))return;for(const raw of readFileSync(file,'utf8').split(/\r?\n/)){const line=raw.trim();if(!line||line.startsWith('#'))continue;const index=line.indexOf('=');if(index<1)continue;const key=line.slice(0,index).trim();const value=line.slice(index+1).trim().replace(/^['"]|['"]$/g,'');if(process.env[key]===undefined)process.env[key]=value}}
loadEnv()
const database=process.env.MYSQL_DATABASE||'penetrative_supervision'
const pool=mysql.createPool({host:process.env.MYSQL_HOST||'127.0.0.1',port:Number(process.env.MYSQL_PORT||3306),user:process.env.MYSQL_USER||'root',password:process.env.MYSQL_PASSWORD||'',database,waitForConnections:true,connectionLimit:4,charset:'utf8mb4'})
try{
  await initializeSceneRuleDatabase(pool);await initializeDataGraphDatabase(pool);await initializeRuleCatalogDatabase(pool)
  const apply=process.argv.includes('--apply')
  const preview=await previewRuleCatalogImport(pool)
  if(!apply){console.log(JSON.stringify({mode:'dry-run',...preview},null,2));process.exitCode=preview.ok?0:1}
  else if(!preview.ok){console.error(JSON.stringify(preview,null,2));process.exitCode=1}
  else console.log(JSON.stringify(await importRuleCatalog(pool,{operator:process.env.RULE_CATALOG_OPERATOR||'尹晨阳'}),null,2))
}finally{await pool.end()}