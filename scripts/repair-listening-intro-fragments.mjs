#!/usr/bin/env node
/** Remove only cache-proven listening instruction fragments from EN and ZH.
 * Dry-run by default. Keep original text and provenance in each changed unit.
 */
import {createHash} from 'node:crypto';
import {readFile,readdir,mkdir,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {splitPart34Introduction} from './rebuild-listening-transcripts.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const VERSION='verified_listening_intro_cleanup_v1';
const PREFIXES=new Map([
  ['and list of classes.','和课程列表。'],
  ['information.','信息。'],
  ['information and map.','信息和地图。'],
  ['and room layouts.','和房间布局。'],
  ['and shirt options.','和衬衫选项。'],
  ['and report.','和报告。'],
  ['and logos.','和标志。'],
  ['and airport departure board.','和机场出发大屏幕。'],
  ['and weather report.','和天气报告。'],
  ['and product samples.','和产品样品。'],
]);
const sha=s=>createHash('sha256').update(s).digest('hex');
const normalized=s=>String(s).normalize('NFKC').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/\s+/g,' ').trim();

export function planIntroFragmentCleanup(detail,cache,audioHash){
  if(![3,4].includes(detail.part))return {status:'unaffected'};
  const context=detail.context||{},before=context.transcript||'';
  const prefix=[...PREFIXES.keys()].find(prefix=>before.startsWith(`${prefix}\n`));
  if(!prefix)return {status:'unaffected'};
  const refuse=reason=>({status:'skipped',reason});
  if(!audioHash||context.transcript_source?.audio_sha256!==audioHash||cache?.audio_sha256!==audioHash)return refuse('Audio fingerprint does not match both published provenance and ASR cache.');
  if(cache.model_sha256!==context.transcript_source?.model_sha256)return refuse('ASR model fingerprint does not match published provenance.');
  const transcript=before.slice(prefix.length+1);
  const ids=(detail.items||[]).map(i=>Number(i.item_id));
  let evidence;
  for(const key of ['raw','raw_prompted','raw_segmented']){
    if(typeof cache[key]!=='string')continue;
    try{
      const split=splitPart34Introduction(cache[key],Math.min(...ids),Math.max(...ids));
      if(normalized(split.body)===normalized(transcript)&&normalized(split.introduction).endsWith(prefix)){
        evidence={cache_field:key,raw_sha256:sha(cache[key]),verified_introduction:split.introduction};break;
      }
    }catch{/* Unknown introductions require review; never guess. */}
  }
  if(!evidence)return refuse('After parsing the exact announced range and material, ASR body does not equal the existing body.');
  const beforeTranslation=context.transcript_translation||'',translationPrefix=PREFIXES.get(prefix);
  if(!beforeTranslation.startsWith(`${translationPrefix}\n`))return refuse('No exact standalone Chinese instruction prefix; translation left untouched.');
  if(context.transcript_translation_source?.transcript_sha256!==sha(before))return refuse('Existing translation is not linked to this exact English transcript.');
  const translation=beforeTranslation.slice(translationPrefix.length+1);
  if(!transcript.trim()||!translation.trim())return refuse('Cleanup would remove the entire text.');
  const updated=structuredClone(detail);
  updated.context.transcript_intro_cleanup={
    schema_version:VERSION,audio_sha256:audioHash,removed_english_prefix:prefix,removed_chinese_prefix:translationPrefix,...evidence,
    before:{transcript:before,transcript_translation:beforeTranslation,transcript_source:context.transcript_source,transcript_translation_source:context.transcript_translation_source},
    after_transcript_sha256:sha(transcript),after_translation_sha256:sha(translation),
  };
  updated.context.transcript=transcript;
  updated.context.transcript_translation=translation;
  updated.context.transcript_source={...context.transcript_source,postprocess_version:VERSION,metrics:{...context.transcript_source.metrics,word_count:(transcript.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)||[]).length}};
  updated.context.transcript_translation_source={...context.transcript_translation_source,transcript_sha256:sha(transcript),postprocess_version:VERSION};
  return {status:'ready',detail:updated,prefix,translationPrefix,evidence};
}

export async function main(argv=process.argv.slice(2)){
  if(argv.some(a=>a!=='--write'))throw new Error('Only --write is accepted; default is a read-only dry run.');
  const write=argv.includes('--write'),rows=[];
  const dataRoot=path.join(root,'public/data/banks');
  for(const bank of (await readdir(dataRoot)).sort())for(const filename of (await readdir(path.join(dataRoot,bank,'units'))).sort()){
    if(!filename.endsWith('.json'))continue;
    const file=path.join(dataRoot,bank,'units',filename),detail=JSON.parse(await readFile(file,'utf8'));
    if(![3,4].includes(detail.part)||![...PREFIXES.keys()].some(p=>detail.context?.transcript?.startsWith(`${p}\n`)))continue;
    const source=detail.context.transcript_source||{},cacheFile=path.join(root,'outputs/listening-transcripts',String(source.model_sha256).slice(0,16),bank,filename);
    let result;
    try{
      const cache=JSON.parse(await readFile(cacheFile,'utf8'));
      const ref=detail.context.audio_path?.asset_key||detail.context.audio_path;
      const audioHash=sha(await readFile(path.join(root,'public/assets',ref)));
      result=planIntroFragmentCleanup(detail,cache,audioHash);
    }catch(error){result={status:'skipped',reason:error.message}}
    rows.push({bank,unit:detail.unit_id,status:result.status,reason:result.reason,prefix:result.prefix,translation_prefix:result.translationPrefix,evidence:result.evidence});
    if(write&&result.status==='ready'){
      const temporary=`${file}.tmp-intro-${process.pid}`;
      await writeFile(temporary,JSON.stringify(result.detail,null,2)+'\n');await rename(temporary,file);
    }
  }
  const report={schema_version:VERSION,write,changed:rows.filter(r=>r.status==='ready').length,skipped:rows.filter(r=>r.status==='skipped').length,rows};
  await mkdir(path.join(root,'outputs'),{recursive:true});
  await writeFile(path.join(root,'outputs/listening-intro-fragments-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
