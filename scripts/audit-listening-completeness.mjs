#!/usr/bin/env node
/** Read-only audit of published listening text against matching cached audio ASR.
 * This reports omissions for review; an ASR disagreement is not a correction.
 */
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const execute=promisify(execFile);
const dataRoot=path.join(root,'public/data/banks');
const cacheRoot=path.join(root,'outputs/listening-transcripts');
const tokens=s=>String(s||'').match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.map(s=>s.toLowerCase().replaceAll('’',"'"))||[];
const normalize=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();
function missingRuns(reference,published){
  const a=tokens(reference),b=tokens(published),table=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
  for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)table[i][j]=a[i]===b[j]?table[i+1][j+1]+1:Math.max(table[i+1][j],table[i][j+1]);
  const runs=[];let i=0,j=0,current=null;
  while(i<a.length){if(j<b.length&&a[i]===b[j]){if(current){runs.push(current);current=null}i++;j++;}else if(j<b.length&&table[i][j+1]>table[i+1][j])j++;else{if(!current)current={start:i,words:[]};current.words.push(a[i++]);}}
  if(current)runs.push(current);
  return {reference_words:a.length,published_words:b.length,matched_words:table[0][0],missing_runs:runs.map(r=>({...r,length:r.words.length,text:r.words.join(' '),words:undefined})),coverage:a.length?table[0][0]/a.length:1};
}
function candidateBody(raw,part){
  let s=normalize(raw).replace(/\s+Go on to the next page\.?[\s\S]*$/i,'').replace(/\s+This is the end of (?:Part|the)\s+\w+\.?[\s\S]*$/i,'');
  if(part===1)return s.replace(/^[\s\S]*?(?=\bA\.\s)/,'');
  if(part===2)return s.replace(/^Number\s+(?:\d+|[a-z]+(?:[- ][a-z]+)?)[\s.,:;-]*/i,'');
  // Only drop the official announced material label. Never search for a later
  // question or infer the length of spoken content from OCR text.
  s=s.replace(/^[^!?]{0,100}?\brefer\s+to\s+the\s+following\s+(?:conversation(?: with three speakers)?|telephone message|recorded message|radio broadcast|broadcast|talk|excerpt from a (?:meeting|radio interview|workshop)|announcement|speech|instructions|introduction|advertisement|news report|tour information|message|podcast)(?: and [A-Za-z -]{1,45})?[.:]\s*/i,'');
  return s.replace(/^(?:(?:and|with)\s+(?:[a-z][a-z -]{0,48}\s+)?(?:chart|graphic|graph|list|brochure|map|schedule|table|receipt|menu|sign|coupon|order|bill|plan|agenda|results|keys|page|layout|card|flyer|machine|poster|timeline|calendar|directory)|information and ticket)\s*[.!?]\s*/i,'');
}
const includeDurations=!process.argv.includes('--skip-durations');
const models=(await readdir(cacheRoot,{withFileTypes:true})).filter(d=>d.isDirectory()).map(d=>d.name);
const rows=[];
for(const bank of (await readdir(dataRoot)).sort()){
  for(const filename of (await readdir(path.join(dataRoot,bank,'units'))).sort()){
    const d=JSON.parse(await readFile(path.join(dataRoot,bank,'units',filename),'utf8'));
    if(d.part<1||d.part>4)continue;
    const context=d.context||{},source=context.transcript_source||{},published=context.transcript||'';
    const audioRef=context.audio_path?.asset_key||context.audio_path;
    const audioFile=typeof audioRef==='string'?path.join(root,'public/assets',audioRef):null;
    let audioHash=null,audioError=null;
    try{audioHash=createHash('sha256').update(await readFile(audioFile)).digest('hex')}catch(error){audioError=error.message}
    const row={bank,unit:d.unit_id,part:d.part,published,source_method:source.method,audio_hash_matches_provenance:audioHash===source.audio_sha256,audio_error:audioError,variants:[]};
    for(const model of models){
      let cache;try{cache=JSON.parse(await readFile(path.join(cacheRoot,model,bank,filename),'utf8'))}catch{continue}
      if(cache.audio_sha256!==audioHash)continue;
      for(const key of ['raw','raw_prompted','raw_segmented']){
        if(!cache[key])continue;
        const isSelected=source.model_sha256===cache.model_sha256&&key===(source.method?.endsWith(':overlap_segments')?'raw_segmented':source.method?.endsWith(':ocr_prompted_audio')?'raw_prompted':'raw');
        const body=candidateBody(cache[key],d.part);
        row.variants.push({model,key,selected:isSelected,body,segment_offsets_ms:cache.segment_offsets_ms,...missingRuns(body,published)});
      }
    }
    row.selected_loss=row.variants.find(v=>v.selected)?.missing_runs.filter(r=>r.length>=2)||[];
    row.max_alternative_missing_run=Math.max(0,...row.variants.filter(v=>!v.selected).flatMap(v=>v.missing_runs.map(r=>r.length)));
    rows.push(row);
  }
}
if(includeDurations){
  let cursor=0;
  await Promise.all(Array.from({length:8},async()=>{while(cursor<rows.length){const row=rows[cursor++];const d=JSON.parse(await readFile(path.join(dataRoot,row.bank,'units',`${row.unit}.json`),'utf8'));const ref=d.context.audio_path?.asset_key||d.context.audio_path;try{const {stdout}=await execute('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',path.join(root,'public/assets',ref)]);row.duration_seconds=Number(stdout.trim());row.words_per_second=tokens(row.published).length/row.duration_seconds}catch(error){row.duration_error=error.message}}}));
}
rows.sort((a,b)=>Math.max(0,...b.selected_loss.map(r=>r.length))-Math.max(0,...a.selected_loss.map(r=>r.length))||b.max_alternative_missing_run-a.max_alternative_missing_run);
const summary={units:rows.length,by_part:Object.fromEntries([1,2,3,4].map(p=>[p,rows.filter(r=>r.part===p).length])),audio_hash_mismatches:rows.filter(r=>!r.audio_hash_matches_provenance).length,selected_raw_loss_units:rows.filter(r=>r.selected_loss.length).length,alternative_long_omission_units:rows.filter(r=>r.max_alternative_missing_run>=8).length,duration_audited_units:rows.filter(r=>r.duration_seconds).length,low_speech_rate_units:includeDurations?rows.filter(r=>r.part>=3&&r.words_per_second<1.7).length:null};
const report={generated_at:new Date().toISOString(),scope:'matching audio SHA only; variants require review against audio',summary,rows};
await mkdir(path.join(root,'outputs'),{recursive:true});
const output=path.join(root,'outputs/listening-completeness-audit.json');
await writeFile(output,JSON.stringify(report,null,2)+'\n');
// Cache candidates are reviewer inputs only. In particular, prompted ASR may
// copy OCR or hallucinate, so no candidate here is automatically published.
const reviewIds={
  'official-1-test-1/p4-98-100':'Full prompted candidate restores the video-game market-share opening; compare with audio.',
  'official-4-test-2/p4-89-91':'Full prompted candidate restores store sale announcement; remove leading OCR chevron and intro only after review.',
  'official-6-test-1/p4-71-73':'Full prompted candidate restores galaxy exhibit opening; spelled-number introduction is metadata.',
  'official-10-test-1/p4-95-97':'Prompted text has opening but repeats IT-listings clauses; segmented text has cleaner tail, not a complete transcript.',
  'official-3-test-1/p4-92-94':'Prompted candidate restores Tucker Treats packaging background; verify name spelling and leading W ornament.',
  'official-3-test-2/p4-92-94':'Prompted candidate restores board-meeting opening but has duplicated technical-team phrase.',
  'official-10-test-1/p4-77-79':'Prompted candidate restores ticket-sales opening but K.K. tokens are OCR ornaments.',
  'official-10-test-1/p4-83-85':'Prompted candidate restores craft-fair opening but says credit-card payments are not, then are much quicker; needs audio adjudication.',
  'official-9-test-2/p4-92-94':'Full prompted candidate restores mushroom-book talk opening.',
  'official-3-test-2/p4-86-88':'Current prompted text contains only opening, raw contains ending; merge only after audio verifies no missing middle. ERw ornaments must be removed.',
  'official-3-test-2/p4-77-79':'Above rate threshold only because of repeated tail. Current text starts mid-sentence; prompted version restores bus-company earnings opening but has errors mid-body.',
  'official-10-test-1/p4-86-88':'Rate looks normal but segmented tail includes He does not always agree to give interviews, so; prompted publication omitted this clause.',
};
function repetitive(text){const t=tokens(text);for(let w=1;w<=6;w++)for(let i=0;i+w*4<=t.length;i++)if([1,2,3].every(k=>t.slice(i,i+w).join(' ')===t.slice(i+w*k,i+w*(k+1)).join(' ')))return true;return false;}
const candidates=rows.filter(r=>(r.part>=3&&r.words_per_second<1.7)||['official-3-test-2/p4-77-79','official-10-test-1/p4-86-88'].includes(`${r.bank}/${r.unit}`)).map(r=>({
  bank:r.bank,unit:r.unit,part:r.part,duration_seconds:r.duration_seconds,words_per_second:r.words_per_second,
  current_transcript:r.published,reason:reviewIds[`${r.bank}/${r.unit}`]||'Current transcript starts mid-message or has too few words for track length. Existing caches do not supply a reliable full candidate; re-transcribe short overlapping windows.',
  requires_audio_verification:true,
  candidates:r.variants.filter(v=>!v.selected&&!repetitive(v.body)&&v.reference_words<260).map(v=>({model:v.model,key:v.key,transcript:v.body,word_count:v.reference_words,missing_runs:v.missing_runs.filter(r=>r.length>=3),source_cache:path.relative(root,path.join(cacheRoot,v.model,r.bank,`${r.unit}.json`))})),
}));
await writeFile(path.join(root,'outputs/listening-completeness-candidates.json'),JSON.stringify({generated_at:new Date().toISOString(),warning:'Review candidates only, not audio-verified corrections.',count:candidates.length,candidates},null,2)+'\n');
console.log(JSON.stringify({summary,report:output,selected_loss_examples:rows.filter(r=>r.selected_loss.length).slice(0,20).map(r=>({bank:r.bank,unit:r.unit,loss:r.selected_loss}))},null,2));
