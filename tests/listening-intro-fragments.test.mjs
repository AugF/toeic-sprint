import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {planIntroFragmentCleanup} from '../scripts/repair-listening-intro-fragments.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
function fixture(){
  const transcript='and list of classes.\nHere is the class schedule.\nPlease choose a session.';
  const detail={part:3,items:[{item_id:65},{item_id:66},{item_id:67}],context:{transcript,transcript_translation:'和课程列表。\n这是课程表。\n请选择一节课。',transcript_source:{audio_sha256:'audio',model_sha256:'model',metrics:{word_count:17}},transcript_translation_source:{transcript_sha256:sha(transcript)}}};
  const cache={audio_sha256:'audio',model_sha256:'model',raw:'Questions 65 through 67 refer to the following conversation and list of classes. Here is the class schedule. Please choose a session.'};
  return {detail,cache};
}
test('removes only a verified bilingual instruction line, preserving body and provenance',()=>{
  const {detail,cache}=fixture(),result=planIntroFragmentCleanup(detail,cache,'audio');
  assert.equal(result.status,'ready');
  assert.equal(result.detail.context.transcript,'Here is the class schedule.\nPlease choose a session.');
  assert.equal(result.detail.context.transcript_translation,'这是课程表。\n请选择一节课。');
  assert.equal(result.detail.context.transcript_translation_source.transcript_sha256,sha(result.detail.context.transcript));
  assert.equal(result.detail.context.transcript_intro_cleanup.before.transcript,detail.context.transcript);
  assert.equal(planIntroFragmentCleanup(result.detail,cache,'audio').status,'unaffected');
});
test('refuses a different audio, different model, wrong question range or differing ASR body',()=>{
  for(const change of [c=>c.audio_sha256='other',c=>c.model_sha256='other',c=>c.raw=c.raw.replace('65 through 67','62 through 64'),c=>c.raw=c.raw.replace('Please choose a session.','Important extra sentence.')]){
    const {detail,cache}=fixture();change(cache);assert.equal(planIntroFragmentCleanup(detail,cache,'audio').status,'skipped');
  }
});
test('refuses uncertain Chinese prefix or stale translation hash',()=>{
  for(const change of [d=>d.context.transcript_translation='课程资料如下。\n这是课程表。',d=>d.context.transcript_translation_source.transcript_sha256='stale',d=>d.context.transcript_translation='和课程列表。这是正文。']){
    const {detail,cache}=fixture();change(detail);assert.equal(planIntroFragmentCleanup(detail,cache,'audio').status,'skipped');
  }
});
test('does not strip a real spoken sentence starting with and or information',()=>{
  const {detail,cache}=fixture();detail.context.transcript='And today you will learn to use our database.\nThe session begins now.';
  assert.equal(planIntroFragmentCleanup(detail,cache,'audio').status,'unaffected');
});
